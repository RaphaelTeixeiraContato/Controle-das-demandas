// Inicializar Supabase
const supabaseUrl = 'https://jjclbgfcyilelaonlinz.supabase.co';
const supabaseKey = 'sb_publishable_gZil1XA4TyqvEu4HGEIYow_NIFWqhPC';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
let loggedUser = null;
let userAccessLevel = null;

let demandas = [];
let historico = [];
let logsAcoes = [];
let configuracoes = { responsaveis: [], assessores: [], meios: [] };
let usuarios = [];

const showToast = (message, type = 'success') => {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast ' + type;

    let icon = 'ph-check-circle';
    if (type === 'error') icon = 'ph-x-circle';
    else if (type === 'warning') icon = 'ph-warning-circle';
    else if (type === 'info') icon = 'ph-info';

    toast.innerHTML = `<i class="ph ${icon}"></i><span class="toast-message">${message}</span><button class="toast-close"><i class="ph ph-x"></i></button>`;

    container.appendChild(toast);

    const closeBtn = toast.querySelector('.toast-close');

    const removeToast = () => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    };

    closeBtn.addEventListener('click', removeToast);

    setTimeout(() => {
        if (toast.parentElement) {
            removeToast();
        }
    }, 3000);
};

document.addEventListener('DOMContentLoaded', () => {
    // Auth UI
    const loginOverlay = document.getElementById('loginOverlay');
    const appContainer = document.getElementById('appContainer');
    const btnLoginGoogle = document.getElementById('btnLoginGoogle');
    const loginErrorMsg = document.getElementById('loginErrorMsg');

    // Modais
    const modal = document.getElementById('modalNovaDemanda');
    const modalExcluir = document.getElementById('modalExcluirDemanda');
    const modalTransferir = document.getElementById('modalTransferirDemanda');

    // Botões
    const btnNova = document.getElementById('btnNovaDemanda');
    const btnClose = document.getElementById('btnCloseModal');
    const btnCancel = document.getElementById('btnCancelModal');

    const btnCancelDelete = document.getElementById('btnCancelDelete');
    const btnConfirmDelete = document.getElementById('btnConfirmDelete');

    const btnCancelTransfer = document.getElementById('btnCancelTransfer');
    const btnConfirmTransfer = document.getElementById('btnConfirmTransfer');
    const inputDataEncerramento = document.getElementById('inputDataEncerramento');

    const form = document.getElementById('formNovaDemanda');
    const tableBody = document.getElementById('demandTableBody');
    const historicoTableBody = document.getElementById('historicoTableBody');
    const countBadge = document.getElementById('demandCount');
    const topHeader = document.querySelector('.top-header');
    const pageTitle = document.getElementById('pageTitle');
    const headerTitleContainer = document.querySelector('.header-title');

    const inputBuscar = document.getElementById('inputBuscar');
    const btnReset = document.getElementById('btnReset');
    const btnExport = document.getElementById('btnExport');
    const btnRunSeed = document.getElementById('btnRunSeed');
    const btnToggleSidebar = document.getElementById('btnToggleSidebar');
    const sidebar = document.querySelector('.sidebar');
    const tableHeaders = document.querySelectorAll('.demand-table th[data-col]');

    const filterResponsavel = document.getElementById('filterResponsavel');
    const filterMeio = document.getElementById('filterMeio');

    const navItems = document.querySelectorAll('.nav-item[data-page]');
    const viewAbertas = document.getElementById('viewAbertas');
    const viewHistorico = document.getElementById('viewHistorico');

    // Estado da aplicação
    let currentPage = 'abertas';
    let currentLogDeleteAction = null;
    let currentLogDeleteId = null; // 'abertas' | 'historico'
    let selectedIds = [];

    // Bulk Elements
    const bulkActionsContainer = document.getElementById('bulkActionsContainer');
    const bulkSelectedCount = document.getElementById('bulkSelectedCount');
    const btnBulkExcluir = document.getElementById('btnBulkExcluir');
    const btnBulkTransferir = document.getElementById('btnBulkTransferir');
    // Autenticação e Sincronização (Supabase)
    // ==========================================

    // Login com Google
    if (btnLoginGoogle) {
        btnLoginGoogle.addEventListener('click', async () => {
            try {
                loginErrorMsg.style.display = 'none';
                await supabaseClient.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                        redirectTo: window.location.origin + window.location.pathname
                    }
                });
            } catch (error) {
                console.error("Erro no login:", error);
                loginErrorMsg.textContent = "Erro ao fazer login: " + error.message;
                loginErrorMsg.style.display = 'block';
            }
        });
    }

    let usuariosSyncInit = false;
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        const user = session?.user;
        if (user) {
            // Transform user.email and name for backward compatibility
            user.displayName = user.user_metadata?.full_name || user.email.split('@')[0];

            // Fetch usuarios and subscribe
            const fetchUsuarios = async () => {
                const { data } = await supabaseClient.from('usuarios').select('*');
                if (data) usuarios = data;

                if (usuarios.length === 0) {
                    // Primeiro usuário a logar no sistema vira Master
                    await supabaseClient.from('usuarios').insert([{
                        nome: user.displayName,
                        email: user.email,
                        nivel: "Master"
                    }]);
                    return;
                }

                const currentUserDoc = usuarios.find(u => u.email === user.email);
                if (currentUserDoc) {
                    loggedUser = user;
                    userAccessLevel = currentUserDoc.nivel;
                    applyRBAC();
                    renderTables(); // Re-render to hide/show action buttons
                    initDataSync();

                    loginOverlay.style.display = 'none';
                    appContainer.style.display = 'flex';

                    if (typeof renderUsuarios !== 'undefined') renderUsuarios();
                } else {
                    loginErrorMsg.textContent = "Você não tem permissão para acessar o sistema. E-mail logado: " + user.email;
                    loginErrorMsg.style.display = 'block';
                    supabaseClient.auth.signOut();
                }
            };

            fetchUsuarios();

            const initUsuariosSync = () => {
                if (usuariosSyncInit) return;
                usuariosSyncInit = true;
                supabaseClient.channel('usuarios_channel')
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'usuarios' }, fetchUsuarios)
                    .subscribe();
            };
            initUsuariosSync();

        } else {
            loggedUser = null;
            userAccessLevel = null;
            loginOverlay.style.display = 'flex';
            appContainer.style.display = 'none';
        }
    });

    let syncInitialized = false;
    const initDataSync = () => {
        if (syncInitialized) return;
        syncInitialized = true;

        const fetchDemandas = async () => {
            const { data } = await supabaseClient.from('demandas').select('*');
            if (data) { demandas = data; renderTables(); }
        };
        const fetchHistorico = async () => {
            const { data } = await supabaseClient.from('historico').select('*');
            if (data) { historico = data; renderTables(); }
        };
        const fetchLogs = async () => {
            const { data } = await supabaseClient.from('logs').select('*');
            if (data) {
                logsAcoes = data.sort((a, b) => b.timestamp - a.timestamp);
                renderLogs();
            }
        };
        const fetchConfiguracoes = async () => {
            const { data } = await supabaseClient.from('configuracoes').select('*').eq('id', 'geral').single();
            if (data && data.dados) {
                configuracoes = data.dados;
                if (!configuracoes.comQuem) {
                    const now = new Date().toISOString();
                    configuracoes.comQuem = [
                        { nome: "XP", cor: "#8b5cf6", criadoEm: now, atualizadoEm: now },
                        { nome: "Cliente", cor: "#10b981", criadoEm: now, atualizadoEm: now },
                        { nome: "Interno", cor: "#f59e0b", criadoEm: now, atualizadoEm: now }
                    ];
                }
            } else {
                configuracoes = { responsaveis: [], assessores: [], meios: [], guiaTipos: [], comQuem: [] };
                await supabaseClient.from('configuracoes').upsert([{ id: 'geral', dados: configuracoes }]);
            }
            
            // RUNTIME MIGRATION para adicionar datas e transformar strings em objetos
            ['responsaveis', 'meios', 'comQuem', 'assessores'].forEach(type => {
                if (configuracoes[type]) {
                    configuracoes[type] = configuracoes[type].map(item => {
                        if (typeof item === 'string') {
                            return { nome: item, cor: '#8b5cf6', criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() };
                        } else {
                            if (!item.criadoEm) item.criadoEm = new Date().toISOString();
                            if (!item.atualizadoEm) item.atualizadoEm = new Date().toISOString();
                            return item;
                        }
                    });
                }
            });

            if (typeof window.renderControleTable === 'function') window.renderControleTable();
            renderSelectOptions();
            updateFilterOptions();
            renderTables();
        };

        fetchDemandas();
        fetchHistorico();
        fetchLogs();
        fetchConfiguracoes();

        supabaseClient.channel('demandas_channel').on('postgres_changes', { event: '*', schema: 'public', table: 'demandas' }, fetchDemandas).subscribe();
        supabaseClient.channel('historico_channel').on('postgres_changes', { event: '*', schema: 'public', table: 'historico' }, fetchHistorico).subscribe();
        supabaseClient.channel('logs_channel').on('postgres_changes', { event: '*', schema: 'public', table: 'logs' }, fetchLogs).subscribe();
        supabaseClient.channel('configuracoes_channel').on('postgres_changes', { event: '*', schema: 'public', table: 'configuracoes' }, fetchConfiguracoes).subscribe();
    };

    // Função helper para obter data e hora atual formatada
    const getAgoraFormatado = () => {
        const agora = new Date();
        const data = agora.toLocaleDateString('pt-BR');
        const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return `${data} às ${hora}`;
    };


    function applyRBAC() {
        const navControle = document.querySelector('.nav-item[data-page="controle"]');
        const navAcessos = document.querySelector('.nav-item[data-page="acessos"]');
        const navLog = document.querySelector('.nav-item[data-page="log"]');

        const btnNovaDemanda = document.getElementById('btnNovaDemanda');
        const btnNovoGuia = document.getElementById('btnNovoGuia');
        const btnDeleteSelected = document.getElementById('btnDeleteSelected');
        const btnTransferSelected = document.getElementById('btnTransferSelected');
        const theadCheck = document.getElementById('selectAll');

        if (userAccessLevel === 'Master') {
            if (navControle) navControle.style.display = 'flex';
            if (navAcessos) navAcessos.style.display = 'flex';
            if (navLog) navLog.style.display = 'flex';
        } else if (userAccessLevel === 'Editor') {
            if (navControle) navControle.style.display = 'flex';
            if (navAcessos) navAcessos.style.display = 'none';
            if (navLog) navLog.style.display = 'none';
        } else if (userAccessLevel === 'Visualizador') {
            if (navControle) navControle.style.display = 'none';
            if (navAcessos) navAcessos.style.display = 'none';
            if (navLog) navLog.style.display = 'none';

            if (btnNovaDemanda) btnNovaDemanda.style.display = 'none';
            if (btnNovoGuia) btnNovoGuia.style.display = 'none';
            if (theadCheck) {
                theadCheck.disabled = true;
                theadCheck.style.display = 'none';
            }
        }
    };

    const registrarLog = async (acao, detalhes) => {
        if (!loggedUser) return;
        const novoLog = {
            timestamp: Date.now(),
            dataHora: getAgoraFormatado(),
            usuario: loggedUser.displayName || loggedUser.email,
            acao: acao,
            detalhes: detalhes
        };
        try {
            await supabaseClient.from('logs').insert([novoLog]);
        } catch (e) {
            console.error("Erro ao registrar log", e);
        }
    };

    let searchQuery = '';
    let sortConfig = { column: 'data', direction: 'desc' };
    let selectedResponsavel = '';
    let selectedMeio = '';
    let selectedDateInicio = null;
    let selectedDateFim = null;

    let editingId = null;
    let actionId = null; // Serve tanto para delete quanto para transfer

    let deleteType = 'demanda'; // 'demanda' | 'controle'
    let deleteControleParams = { type: null, index: null };
    let editControleParams = { type: null, index: null };

    // ==========================================
    // Roteamento SPA (Single Page Application)
    // ==========================================
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            if (!page) return;

            // Update UI
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            currentPage = page;
            const headerActionsDemandas = document.getElementById('headerActionsDemandas');
            const headerActionsAcessos = document.getElementById('headerActionsAcessos');
            const headerActionsGuias = document.getElementById('headerActionsGuias');

            if (page === 'abertas') {
                if (topHeader) topHeader.style.display = 'flex';
                viewAbertas.style.display = 'block';
                viewHistorico.style.display = 'none';
                document.getElementById('viewControle').style.display = 'none';
                document.getElementById('viewAcessos').style.display = 'none';
                document.getElementById('viewLog').style.display = 'none';
                document.getElementById('viewAjuda').style.display = 'none';
                headerActionsDemandas.style.display = 'flex';
                headerActionsAcessos.style.display = 'none';
                if (headerActionsGuias) headerActionsGuias.style.display = 'none';
                pageTitle.textContent = 'Demandas em aberto';
                countBadge.style.display = 'inline-block';
                if (headerTitleContainer) headerTitleContainer.style.display = 'flex';
                btnNova.style.display = 'flex';
            } else if (page === 'historico') {
                if (topHeader) topHeader.style.display = 'flex';
                viewAbertas.style.display = 'none';
                viewHistorico.style.display = 'block';
                document.getElementById('viewControle').style.display = 'none';
                document.getElementById('viewAcessos').style.display = 'none';
                document.getElementById('viewLog').style.display = 'none';
                document.getElementById('viewAjuda').style.display = 'none';
                headerActionsDemandas.style.display = 'flex';
                headerActionsAcessos.style.display = 'none';
                if (headerActionsGuias) headerActionsGuias.style.display = 'none';
                pageTitle.textContent = 'Histórico de demandas';
                countBadge.style.display = 'inline-block';
                if (headerTitleContainer) headerTitleContainer.style.display = 'flex';
                btnNova.style.display = 'none'; // Não adiciona no histórico diretamente
            } else if (page === 'controle') {
                if (topHeader) topHeader.style.display = 'flex';
                viewAbertas.style.display = 'none';
                viewHistorico.style.display = 'none';
                document.getElementById('viewControle').style.display = 'block';
                document.getElementById('viewAcessos').style.display = 'none';
                document.getElementById('viewLog').style.display = 'none';
                document.getElementById('viewAjuda').style.display = 'none';
                headerActionsDemandas.style.display = 'none';
                headerActionsAcessos.style.display = 'none';
                if (headerActionsGuias) headerActionsGuias.style.display = 'none';
                if (headerTitleContainer) headerTitleContainer.style.display = 'flex';
                pageTitle.textContent = '';
                countBadge.style.display = 'none';
                btnNova.style.display = 'none';
            } else if (page === 'acessos') {
                viewAbertas.style.display = 'none';
                viewHistorico.style.display = 'none';
                if (topHeader) topHeader.style.display = 'flex';
                document.getElementById('viewControle').style.display = 'none';
                document.getElementById('viewAcessos').style.display = 'block';
                document.getElementById('viewLog').style.display = 'none';
                document.getElementById('viewAjuda').style.display = 'none';
                headerActionsDemandas.style.display = 'none';
                headerActionsAcessos.style.display = 'flex';
                if (headerActionsGuias) headerActionsGuias.style.display = 'none';
                if (headerTitleContainer) headerTitleContainer.style.display = 'flex';
                pageTitle.textContent = 'Gerenciar Acessos';
                countBadge.style.display = 'none';
            } else if (page === 'log') {
                viewAbertas.style.display = 'none';
                viewHistorico.style.display = 'none';
                document.getElementById('viewControle').style.display = 'none';
                if (topHeader) topHeader.style.display = 'none';
                document.getElementById('viewAcessos').style.display = 'none';
                document.getElementById('viewLog').style.display = 'block';
                document.getElementById('viewAjuda').style.display = 'none';
                headerActionsDemandas.style.display = 'none';
                headerActionsAcessos.style.display = 'none';
                if (headerActionsGuias) headerActionsGuias.style.display = 'none';
                if (headerTitleContainer) headerTitleContainer.style.display = 'none';
                pageTitle.textContent = 'Histórico de Movimentações';
                countBadge.style.display = 'none';
            } else if (page === 'ajuda') {
                viewAbertas.style.display = 'none';
                viewHistorico.style.display = 'none';
                document.getElementById('viewControle').style.display = 'none';
                document.getElementById('viewAcessos').style.display = 'none';
                if (topHeader) topHeader.style.display = 'flex';
                document.getElementById('viewLog').style.display = 'none';
                document.getElementById('viewAjuda').style.display = 'block';
                if (document.getElementById('viewConfiguracoes')) document.getElementById('viewConfiguracoes').style.display = 'none';
                headerActionsDemandas.style.display = 'none';
                headerActionsAcessos.style.display = 'none';
                if (headerActionsGuias) headerActionsGuias.style.display = 'flex';
                pageTitle.textContent = 'Guia';
                countBadge.style.display = 'none';
                if (headerTitleContainer) headerTitleContainer.style.display = 'none';
                btnNova.style.display = 'none';
                renderGuias();
            } else if (page === 'configuracoes') {
                viewAbertas.style.display = 'none';
                viewHistorico.style.display = 'none';
                document.getElementById('viewControle').style.display = 'none';
                document.getElementById('viewAcessos').style.display = 'none';
                if (topHeader) topHeader.style.display = 'flex';
                document.getElementById('viewLog').style.display = 'none';
                document.getElementById('viewAjuda').style.display = 'none';
                if (document.getElementById('viewConfiguracoes')) document.getElementById('viewConfiguracoes').style.display = 'block';
                headerActionsDemandas.style.display = 'none';
            currentLogDeleteAction = null;
            currentLogDeleteId = null;
        });
    }
});


// Lógica para Gerenciar Tipos Guia
document.addEventListener('DOMContentLoaded', () => {
    const modalGerenciarTiposGuia = document.getElementById('modalGerenciarTiposGuia');
    const btnGerenciarTiposGuia = document.getElementById('btnGerenciarTiposGuia');
    const btnCloseTiposGuia = document.getElementById('btnCloseTiposGuia');
    const btnAdicionarTipoGuia = document.getElementById('btnAdicionarTipoGuia');
    const inputNovoTipoGuia = document.getElementById('inputNovoTipoGuia');
    const tiposGuiaTableBody = document.getElementById('tiposGuiaTableBody');

    const renderTiposGuiaTable = () => {
        if (!tiposGuiaTableBody) return;
        tiposGuiaTableBody.innerHTML = '';
        if (!configuracoes.guiaTipos || configuracoes.guiaTipos.length === 0) {
            tiposGuiaTableBody.innerHTML = '<tr><td colspan="2" class="text-center" style="padding: 20px;">Nenhum tipo cadastrado.</td></tr>';
            return;
        }

        configuracoes.guiaTipos.forEach((tipo, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${tipo}</strong></td>
                <td style="display: flex; gap: 8px;">
                    <button class="icon-btn btn-primary" onclick="window.editarTipoGuia(${index})" title="Editar" style="padding: 4px;"><i class="ph ph-pencil-simple"></i></button>
                    <button class="icon-btn btn-delete" onclick="window.deletarTipoGuia(${index})" title="Excluir" style="padding: 4px;"><i class="ph ph-trash"></i></button>
                </td>
            `;
            tiposGuiaTableBody.appendChild(tr);
        });
    };

    if (btnGerenciarTiposGuia) {
        btnGerenciarTiposGuia.addEventListener('click', () => {
            renderTiposGuiaTable();
            modalGerenciarTiposGuia.classList.add('active');
        });
    }

    if (btnCloseTiposGuia) {
        btnCloseTiposGuia.addEventListener('click', () => {
            modalGerenciarTiposGuia.classList.remove('active');
        });
    }

    if (btnAdicionarTipoGuia) {
        btnAdicionarTipoGuia.addEventListener('click', async () => {
            const novoTipo = inputNovoTipoGuia.value.trim();
            if (!novoTipo) return;

            if (!configuracoes.guiaTipos) configuracoes.guiaTipos = [];
            if (configuracoes.guiaTipos.includes(novoTipo)) {
                showToast('Tipo já existe', 'error');
                return;
            }

            configuracoes.guiaTipos.push(novoTipo);

            try {
                btnAdicionarTipoGuia.disabled = true;
                const { error } = await supabaseClient.from('configuracoes').upsert([{ id: 'geral', dados: configuracoes }]);

                if (error) throw error;

                inputNovoTipoGuia.value = '';
                renderTiposGuiaTable();
                showToast('Tipo adicionado com sucesso', 'success');
            } catch (err) {
                console.error(err);
                showToast('Erro ao adicionar tipo', 'error');
                // revert
                configuracoes.guiaTipos.pop();
            } finally {
                btnAdicionarTipoGuia.disabled = false;
            }
        });
    }

    // Modal de Edição/Exclusão do Tipo Guia
    const closeEd = () => document.getElementById('modalEditarTipoGuia').classList.remove('active');
    const closeEx = () => document.getElementById('modalExcluirTipoGuia').classList.remove('active');
    document.getElementById('btnCloseEditarTipoGuia')?.addEventListener('click', closeEd);
    document.getElementById('btnCancelEditarTipoGuia')?.addEventListener('click', closeEd);
    document.getElementById('btnCloseExcluirTipoGuia')?.addEventListener('click', closeEx);
    document.getElementById('btnCancelExcluirTipoGuia')?.addEventListener('click', closeEx);

    window.deletarTipoGuia = (index) => {
        const tipo = configuracoes.guiaTipos[index];
        const modal = document.getElementById('modalExcluirTipoGuia');
        const textExcluir = document.getElementById('textExcluirTipoGuia');
        const btnConfirm = document.getElementById('btnConfirmExcluirTipoGuia');
        
        if (!modal || !textExcluir || !btnConfirm) return;
        
        textExcluir.textContent = `Tem certeza que deseja excluir o tipo "${tipo}"?`;
        
        const newBtnConfirm = btnConfirm.cloneNode(true);
        btnConfirm.parentNode.replaceChild(newBtnConfirm, btnConfirm);
        
        newBtnConfirm.addEventListener('click', async () => {
            const oldValue = configuracoes.guiaTipos[index];
            configuracoes.guiaTipos.splice(index, 1);
            
            try {
                newBtnConfirm.disabled = true;
                newBtnConfirm.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';
                const { error } = await supabaseClient.from('configuracoes').upsert([{ id: 'geral', dados: configuracoes }]);
                if (error) throw error;
                renderTiposGuiaTable();
                showToast('Tipo excluído', 'success');
                modal.classList.remove('active');
            } catch (err) {
                console.error(err);
                showToast('Erro ao excluir tipo', 'error');
                configuracoes.guiaTipos.splice(index, 0, oldValue);
            } finally {
                newBtnConfirm.disabled = false;
                newBtnConfirm.textContent = 'Excluir';
            }
        });
        
        modal.classList.add('active');
    };

    window.editarTipoGuia = (index) => {
        const tipo = configuracoes.guiaTipos[index];
        const modal = document.getElementById('modalEditarTipoGuia');
        const inputNome = document.getElementById('inputEditarNomeTipoGuia');
        const btnSave = document.getElementById('btnSaveEditarTipoGuia');
        
        if (!modal || !inputNome || !btnSave) return;
        
        inputNome.value = tipo;
        
        const newBtnSave = btnSave.cloneNode(true);
        btnSave.parentNode.replaceChild(newBtnSave, btnSave);
        
        newBtnSave.addEventListener('click', async () => {
            const novoNome = inputNome.value.trim();
            if (!novoNome || novoNome === tipo) {
                modal.classList.remove('active');
                return;
            }
            if (configuracoes.guiaTipos.includes(novoNome)) {
                showToast('Este tipo já existe', 'error');
                return;
            }
            
            const oldValue = configuracoes.guiaTipos[index];
            configuracoes.guiaTipos[index] = novoNome;
            
            try {
                newBtnSave.disabled = true;
                newBtnSave.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';
                const { error } = await supabaseClient.from('configuracoes').upsert([{ id: 'geral', dados: configuracoes }]);
                if (error) throw error;
                renderTiposGuiaTable();
                showToast('Tipo atualizado', 'success');
                modal.classList.remove('active');
            } catch (err) {
                console.error(err);
                showToast('Erro ao atualizar tipo', 'error');
                configuracoes.guiaTipos[index] = oldValue;
            } finally {
                newBtnSave.disabled = false;
                newBtnSave.textContent = 'Salvar';
            }
        });
        
        modal.classList.add('active');
    };
});
