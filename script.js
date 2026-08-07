// Load theme immediately to prevent flash
if (localStorage.getItem('theme') === 'light') {
    document.documentElement.classList.add('light-mode');
}

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
let guias = [];

let paginationState = {
    abertas: 1,
    historico: 1,
    logs: 1,
    controle: 1,
    acessos: 1,
    guias: 1,
    tiposGuia: 1
};

const renderPagination = (containerId, moduleKey, totalItems, itemsPerPage, renderFunction) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    let currentPage = paginationState[moduleKey];

    if (currentPage > totalPages) {
        paginationState[moduleKey] = totalPages;
        currentPage = totalPages;
    }

    if (totalPages <= 1) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    container.style.display = 'flex';
    container.innerHTML = `
        <span class="pagination-info">Página ${currentPage} de ${totalPages} (${totalItems} itens)</span>
        <button class="pagination-btn" id="btnPrev_${moduleKey}" ${currentPage === 1 ? 'disabled' : ''}><i class="ph ph-caret-left"></i> Anterior</button>
        <button class="pagination-btn" id="btnNext_${moduleKey}" ${currentPage === totalPages ? 'disabled' : ''}>Próximo <i class="ph ph-caret-right"></i></button>
    `;

    const btnPrev = document.getElementById(`btnPrev_${moduleKey}`);
    const btnNext = document.getElementById(`btnNext_${moduleKey}`);

    if (btnPrev) {
        btnPrev.addEventListener('click', () => {
            if (paginationState[moduleKey] > 1) {
                paginationState[moduleKey]--;
                renderFunction();
            }
        });
    }

    if (btnNext) {
        btnNext.addEventListener('click', () => {
            if (paginationState[moduleKey] < totalPages) {
                paginationState[moduleKey]++;
                renderFunction();
            }
        });
    }
};

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
                const { data, error } = await supabaseClient.from('usuarios').select('*');

                if (error) {
                    console.error("Erro ao buscar usuários:", error);
                    loginErrorMsg.textContent = "Sessão expirada ou erro de autenticação. Por favor, faça login novamente.";
                    loginErrorMsg.style.display = 'block';
                    await supabaseClient.auth.signOut();
                    return;
                }

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
    const forceDataRefresh = async () => {
        const { data: dData } = await supabaseClient.from('demandas').select('*');
        if (dData) demandas = dData;
        const { data: hData } = await supabaseClient.from('historico').select('*');
        if (hData) historico = hData;
        const { data: lData } = await supabaseClient.from('logs').select('*');
        if (lData) { logsAcoes = lData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); renderLogs(); }
        renderTables();
    };
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
                    configuracoes[type] = configuracoes[type].filter(Boolean).map(item => {
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
                if (document.getElementById("viewAjuda")) document.getElementById("viewAjuda").style.display = "none";

                headerActionsDemandas.style.display = 'flex';
                if (document.getElementById('headerActionsControle')) document.getElementById('headerActionsControle').style.display = 'none';
                if (document.getElementById('headerActionsLogs')) document.getElementById('headerActionsLogs').style.display = 'none';
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
                if (document.getElementById("viewAjuda")) document.getElementById("viewAjuda").style.display = "none";

                headerActionsDemandas.style.display = 'flex';
                if (document.getElementById('headerActionsControle')) document.getElementById('headerActionsControle').style.display = 'none';
                if (document.getElementById('headerActionsLogs')) document.getElementById('headerActionsLogs').style.display = 'none';
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
                if (document.getElementById("viewAjuda")) document.getElementById("viewAjuda").style.display = "none";

                headerActionsDemandas.style.display = 'none';
                if (document.getElementById('headerActionsControle')) document.getElementById('headerActionsControle').style.display = 'none';
                if (document.getElementById('headerActionsLogs')) document.getElementById('headerActionsLogs').style.display = 'none';
                headerActionsAcessos.style.display = 'none';
                if (headerActionsGuias) headerActionsGuias.style.display = 'none';
                if (headerTitleContainer) headerTitleContainer.style.display = 'flex';
                pageTitle.textContent = 'Controle';
                if (document.getElementById('headerActionsControle')) document.getElementById('headerActionsControle').style.display = 'flex';
                countBadge.style.display = 'none';
                btnNova.style.display = 'none';
            } else if (page === 'ajuda') {
                if (topHeader) topHeader.style.display = 'flex';
                viewAbertas.style.display = 'none';
                viewHistorico.style.display = 'none';
                if (document.getElementById('viewControle')) document.getElementById('viewControle').style.display = 'none';
                if (document.getElementById('viewAcessos')) document.getElementById('viewAcessos').style.display = 'none';
                if (document.getElementById('viewLog')) document.getElementById('viewLog').style.display = 'none';
                if (document.getElementById("viewAjuda")) document.getElementById("viewAjuda").style.display = "block";
                
                headerActionsDemandas.style.display = 'none';
                if (document.getElementById('headerActionsControle')) document.getElementById('headerActionsControle').style.display = 'none';
                if (document.getElementById('headerActionsLogs')) document.getElementById('headerActionsLogs').style.display = 'none';
                headerActionsAcessos.style.display = 'none';
                const headerActionsGuias = document.getElementById('headerActionsGuias');
                if (headerActionsGuias) headerActionsGuias.style.display = 'flex';
                pageTitle.textContent = 'Guia';
                countBadge.style.display = 'none';
                if (headerTitleContainer) headerTitleContainer.style.display = 'none';
                btnNova.style.display = 'none';
                renderGuias();
            } else if (page === 'acessos') {
                viewAbertas.style.display = 'none';
                viewHistorico.style.display = 'none';
                if (topHeader) topHeader.style.display = 'flex';
                document.getElementById('viewControle').style.display = 'none';
                document.getElementById('viewAcessos').style.display = 'block';
                document.getElementById('viewLog').style.display = 'none';
                if (document.getElementById("viewAjuda")) document.getElementById("viewAjuda").style.display = "none";

                headerActionsDemandas.style.display = 'none';
                if (document.getElementById('headerActionsControle')) document.getElementById('headerActionsControle').style.display = 'none';
                if (document.getElementById('headerActionsLogs')) document.getElementById('headerActionsLogs').style.display = 'none';
                headerActionsAcessos.style.display = 'flex';
                if (headerActionsGuias) headerActionsGuias.style.display = 'none';
                if (headerTitleContainer) headerTitleContainer.style.display = 'flex';
                pageTitle.textContent = 'Gerenciar Acessos';
                countBadge.style.display = 'none';
            } else if (page === 'log') {
                viewAbertas.style.display = 'none';
                viewHistorico.style.display = 'none';
                document.getElementById('viewControle').style.display = 'none';
                if (topHeader) topHeader.style.display = 'flex';
                document.getElementById('viewAcessos').style.display = 'none';
                document.getElementById('viewLog').style.display = 'block';
                if (document.getElementById("viewAjuda")) document.getElementById("viewAjuda").style.display = "none";

                headerActionsDemandas.style.display = 'none';
                if (document.getElementById('headerActionsControle')) document.getElementById('headerActionsControle').style.display = 'none';
                if (document.getElementById('headerActionsLogs')) document.getElementById('headerActionsLogs').style.display = 'none';
                headerActionsAcessos.style.display = 'none';
                if (headerActionsGuias) headerActionsGuias.style.display = 'none';
                if (headerTitleContainer) headerTitleContainer.style.display = 'none';
                pageTitle.textContent = 'Histórico de Movimentações';
                if (document.getElementById('headerActionsLogs')) document.getElementById('headerActionsLogs').style.display = 'flex';
                if (headerTitleContainer) headerTitleContainer.style.display = 'flex';
                countBadge.style.display = 'none';
            }

            // Reset pagination state
            paginationState = {
                abertas: 1,
                historico: 1,
                logs: 1,
                controle: 1,
                acessos: 1,
                guias: 1,
                tiposGuia: 1
            };

            // Reset filters and selection on page change
            searchQuery = '';
            inputBuscar.value = '';
            selectedResponsavel = '';
            selectedMeio = '';
            selectedDateInicio = null;
            selectedDateFim = null;
            selectedIds = [];

            if (document.getElementById('filterResponsavel')) document.getElementById('filterResponsavel').value = '';
            if (document.getElementById('filterMeio')) document.getElementById('filterMeio').value = '';
            if (document.getElementById('filterAssessor')) document.getElementById('filterAssessor').value = '';
            if (document.getElementById('filterComQuem')) document.getElementById('filterComQuem').value = '';

            // Controle filters
            const inpBuscarControle = document.getElementById('inputBuscarControle');
            if (inpBuscarControle) inpBuscarControle.value = '';
            const selCatControle = document.getElementById('selectCategoriaControle');
            if (selCatControle) selCatControle.value = 'responsaveis';

            // Logs filters
            searchLogsQuery = '';
            const inpBuscarLogs = document.getElementById('inputBuscarLogs');
            if (inpBuscarLogs) inpBuscarLogs.value = '';
            selectedLogsDateInicio = null;
            selectedLogsDateFim = null;
            if (window.datePickerLogsInstance) {
                window.datePickerLogsInstance.clear();
                const logDateValue = document.getElementById('dateFilterValueLogs');
                if (logDateValue) logDateValue.textContent = 'Período...';
            }

            // Guia filters
            const inpBuscarGuia = document.getElementById('inputBuscarGuia');
            if (inpBuscarGuia) inpBuscarGuia.value = '';
            const filterGuia = document.getElementById('filterGuiaTipo');
            if (filterGuia) filterGuia.value = '';

            if (typeof updateBulkActionsControle === 'function') {
                const sAll = document.getElementById('selectAllControle');
                if (sAll) sAll.checked = false;
                document.querySelectorAll('.row-checkbox-controle').forEach(cb => cb.checked = false);
                updateBulkActionsControle();
            }

            selectedLogsIds = [];
            if (typeof updateLogsBulkVisibility === 'function') updateLogsBulkVisibility();

            updateBulkActionsVisibility();
            document.querySelectorAll('.select-all-checkbox').forEach(cb => {
                cb.checked = false;
                cb.indeterminate = false;
            });
            if (window.datePickerInstance) {
                window.datePickerInstance.clear();
                const mainDateValue = document.getElementById('dateFilterValue');
                if (mainDateValue) mainDateValue.textContent = 'Período...';
            }
            sortConfig = { column: 'data', direction: 'desc' };

            updateFilterOptions();
            renderTables();
            if (typeof renderLogs === 'function') renderLogs();
            if (typeof window.renderControleTable === 'function') window.renderControleTable();
            if (typeof renderGuias === 'function' && page === 'ajuda') renderGuias();
        });
    });

    // ==========================================
    // Sidebar Toggle
    // ==========================================
    btnToggleSidebar.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
    });

    // ==========================================
    // Funções do Modal de Demanda (Adicionar/Editar)
    // ==========================================
    const openModal = () => {
        modal.classList.add('active');
        if (!editingId) {
            form.reset();
            if (tsResponsavel) tsResponsavel.clear();
            if (tsAssessor) tsAssessor.clear();
            document.querySelector('#modalNovaDemanda h2').textContent = 'Nova Demanda';
            document.querySelector('#formNovaDemanda .btn-submit').textContent = 'Adicionar';
            document.getElementById('inputData').valueAsDate = new Date();
        }
    };

    const closeModal = () => {
        modal.classList.remove('active');
        editingId = null;
    };

    btnNova.addEventListener('click', () => {
        editingId = null;
        if (currentPage === 'abertas') {
            openModal();
        }
    });
    btnClose.addEventListener('click', closeModal);
    btnCancel.addEventListener('click', closeModal);

    // ==========================================
    // Funções do Modal de Exclusão
    // ==========================================
    const openDeleteModal = (id) => {
        deleteType = 'demanda';
        actionId = id;
        document.getElementById('modalDeleteTitle').textContent = 'Excluir demanda';
        document.getElementById('modalDeleteText').textContent = 'Você tem certeza que quer deletar essa demanda?';
        modalExcluir.classList.add('active');
    };

    window.openDeleteControleModal = (type, index) => {
        deleteType = 'controle';
        deleteControleParams = { type, index };
        document.getElementById('modalDeleteTitle').textContent = 'Excluir opção';
        document.getElementById('modalDeleteText').textContent = 'Você tem certeza que quer deletar essa opção?';
        modalExcluir.classList.add('active');
    };

    const closeDeleteModal = () => {
        modalExcluir.classList.remove('active');
        actionId = null;
    };

    btnCancelDelete.addEventListener('click', closeDeleteModal);
    btnConfirmDelete.addEventListener('click', async () => {
        const originalText = btnConfirmDelete.textContent;
        btnConfirmDelete.textContent = "Aguarde...";
        btnConfirmDelete.disabled = true;

        try {
            if (deleteType === 'demanda' && actionId) {
                let demandaDeletada;
                let collectionName = 'demandas';
                if (currentPage === 'abertas') {
                    demandaDeletada = demandas.find(d => d.id === actionId);
                } else {
                    demandaDeletada = historico.find(d => d.id === actionId);
                    collectionName = 'historico';
                }

                const { error: _err1 } = await supabaseClient.from(collectionName).delete().eq("id", String(actionId));
                if (_err1) throw _err1;

                if (demandaDeletada) {
                    registrarLog('Excluiu Demanda', `Demanda "${demandaDeletada.demanda}" do cliente ${demandaDeletada.cliente} foi excluída.`);
                    showToast("Demanda excluída com sucesso!", "success");
                }
            } else if (deleteType === 'controle' && deleteControleParams.type) {
                // Remove of configuracoes
                const typeArray = deleteControleParams.type;
                const index = deleteControleParams.index;
                let valorRemovido;

                if (typeArray === 'responsaveis' || typeArray === 'meios') {
                    valorRemovido = configuracoes[typeArray][index].nome;
                } else {
                    valorRemovido = configuracoes[typeArray][index];
                }

                configuracoes[typeArray].splice(index, 1);
                await supabaseClient.from("configuracoes").upsert([{ "id": "geral", "dados": configuracoes }]);

                registrarLog('Excluiu Opção de Controle', `A opção "${valorRemovido}" foi removida de ${typeArray}.`);
            } else if (deleteType === 'usuario' && actionId) {
                const usuarioRemovido = usuarios.find(u => u.id === actionId);

                const { error: _err2 } = await supabaseClient.from("usuarios").delete().eq("id", String(actionId));
                if (_err2) throw _err2;

                if (usuarioRemovido) {
                    registrarLog('Excluiu Usuário', `O usuário ${usuarioRemovido.nome} (${usuarioRemovido.email}) foi excluído.`);
                    showToast("Usuário excluído com sucesso!", "success");
                }
            } else if (deleteType === 'guia' && actionId) {
                const guiaRemovida = guias.find(g => g.id === actionId);
                const { error: _err3 } = await supabaseClient.from("guias").delete().eq("id", String(actionId));
                if (_err3) throw _err3;
                if (guiaRemovida) {
                    registrarLog('Deletou Guia', `Guia: ${guiaRemovida.titulo}`);
                    showToast("Guia deletada com sucesso!", "success");
                }
            }
            closeDeleteModal();
            await forceDataRefresh();
        } catch (error) {
            console.error("Erro ao excluir:", error);
        }

        btnConfirmDelete.textContent = originalText;
        btnConfirmDelete.disabled = false;
    });

    // ==========================================
    // Funções do Modal de Transferência
    // ==========================================
    const openTransferModal = (id) => {
        actionId = id;
        inputDataEncerramento.valueAsDate = new Date(); // Data de hoje por padrão
        const inputMotivo = document.getElementById('inputMotivoEncerramento');
        const groupMotivo = document.getElementById('groupMotivoEncerramento');
        if (inputMotivo) inputMotivo.value = '';

        if (currentPage === 'historico') {
            document.querySelector('#modalTransferirDemanda h3').textContent = 'Retornar para Abertas';
            document.querySelector('#modalTransferirDemanda p').textContent = 'Deseja retornar esta demanda para as em aberto?';
            inputDataEncerramento.parentElement.style.display = 'none'; // Esconder input de data
            if (groupMotivo) groupMotivo.style.display = 'none'; // Esconder motivo
        } else {
            document.querySelector('#modalTransferirDemanda h3').textContent = 'Transferir para o Histórico';
            document.querySelector('#modalTransferirDemanda p').textContent = 'Informe a data e o motivo do encerramento.';
            inputDataEncerramento.parentElement.style.display = 'block'; // Mostrar input de data
            if (groupMotivo) groupMotivo.style.display = 'block'; // Mostrar motivo
        }

        modalTransferir.classList.add('active');
    };

    const closeTransferModal = () => {
        modalTransferir.classList.remove('active');
        actionId = null;
    };

    btnCancelTransfer.addEventListener('click', closeTransferModal);
    btnConfirmTransfer.addEventListener('click', async () => {
        if (actionId) {
            const originalText = btnConfirmTransfer.textContent;
            btnConfirmTransfer.textContent = "Aguarde...";
            btnConfirmTransfer.disabled = true;

            try {
                if (currentPage === 'abertas') {
                    const demanda = demandas.find(d => d.id === actionId);
                    if (demanda) {
                        const motivo = document.getElementById('inputMotivoEncerramento').value.trim();
                        const demandaTransferida = { ...demanda, dataEncerramento: inputDataEncerramento.value };
                        delete demandaTransferida.id; // Remover ID antes de salvar
                        delete demandaTransferida.created_at; // Prevenir erro 400
                        if (motivo) {
                            demandaTransferida.comentarios = motivo;
                        }

                        await supabaseClient.from("historico").insert([demandaTransferida]);
                        const { error: _err4 } = await supabaseClient.from("demandas").delete().eq("id", String(actionId));
                        if (_err4) throw _err4;

                        registrarLog('Transferiu Demanda (Histórico)', `Demanda "${demanda.demanda}" do cliente ${demanda.cliente} encerrada. Motivo: ${motivo || 'Nenhum'}`);
                        showToast("Demanda transferida para o histórico com sucesso!", "success");
                    }
                } else if (currentPage === 'historico') {
                    const demanda = historico.find(d => d.id === actionId);
                    if (demanda) {
                        const demandaRetornada = { ...demanda };
                        delete demandaRetornada.id;
                        delete demandaRetornada.dataEncerramento;
                        delete demandaRetornada.motivoEncerramento;
                        delete demandaRetornada.timestampEncerramento;
                        delete demandaRetornada.created_at;
                        delete demandaRetornada.originalId;

                        await supabaseClient.from("demandas").insert([demandaRetornada]);
                        const { error: _err5 } = await supabaseClient.from("historico").delete().eq("id", String(actionId));
                        if (_err5) throw _err5;

                        registrarLog('Retornou Demanda (Abertas)', `Demanda "${demanda.demanda}" do cliente ${demanda.cliente} retornada para as demandas em aberto.`);
                        showToast("Demanda retornada para as abertas com sucesso!", "success");
                    }
                }
                closeTransferModal();
                const { data: dData } = await supabaseClient.from('demandas').select('*');
                if (dData) demandas = dData;
                const { data: hData } = await supabaseClient.from('historico').select('*');
                if (hData) historico = hData;
                renderTables();
            } catch (e) {
                console.error("Erro ao transferir demanda", e);
            }

            btnConfirmTransfer.textContent = originalText;
            btnConfirmTransfer.disabled = false;
        }
    });

    // ==========================================
    // Utilitários
    // ==========================================
    const formatDate = (dateString) => {
        if (!dateString) return '-';
        const parts = dateString.split('-');
        if (parts.length !== 3) return dateString;
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    };

    const updateFilterOptions = () => {
        const currResp = filterResponsavel.value;
        const currMeio = filterMeio.value;

        filterResponsavel.innerHTML = '<option value="">Responsável (Todos)</option>';
        if (configuracoes.responsaveis) {
            configuracoes.responsaveis.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r.nome || r; opt.textContent = r.nome || r;
                if ((r.nome || r) === currResp) opt.selected = true;
                filterResponsavel.appendChild(opt);
            });
        }

        filterMeio.innerHTML = '<option value="">Meio (Todos)</option>';
        if (configuracoes.meios) {
            configuracoes.meios.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.nome || m; opt.textContent = m.nome || m;
                if ((m.nome || m) === currMeio) opt.selected = true;
                filterMeio.appendChild(opt);
            });
        }
        if (typeof updateGuiaFilterOptions === 'function') {
            updateGuiaFilterOptions();
        }
    };

    const applyFiltersAndSort = (sourceData) => {
        let result = sourceData;

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(d => {
                return Object.values(d).some(val =>
                    String(val).toLowerCase().includes(query)
                );
            });
        }

        if (selectedResponsavel) {
            result = result.filter(d => d.responsavel === selectedResponsavel);
        }
        if (selectedMeio) {
            result = result.filter(d => d.meio === selectedMeio);
        }
        if (selectedDateInicio) {
            result = result.filter(d => d.data && d.data >= selectedDateInicio);
        }
        if (selectedDateFim) {
            result = result.filter(d => d.data && d.data <= selectedDateFim);
        }

        result.sort((a, b) => {
            const col = sortConfig.column;
            const valA = String(a[col] || '').toLowerCase();
            const valB = String(b[col] || '').toLowerCase();

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    };

    // ==========================================
    // Renderização
    // ==========================================
    const renderTables = () => {
        const sourceData = currentPage === 'abertas' ? applyFiltersAndSort([...demandas]) : applyFiltersAndSort([...historico]);
        const isAbertas = currentPage === 'abertas';
        const pageKey = isAbertas ? 'abertas' : 'historico';
        const limit = isAbertas ? 50 : 100;

        const totalPages = Math.ceil(sourceData.length / limit) || 1;
        if (paginationState[pageKey] > totalPages) paginationState[pageKey] = totalPages;

        const start = (paginationState[pageKey] - 1) * limit;
        const pagedData = sourceData.slice(start, start + limit);

        if (isAbertas) {
            tableBody.innerHTML = '';

            pagedData.forEach((d) => {
                const tr = document.createElement('tr');
                if (selectedIds.includes(d.id)) {
                    tr.classList.add('selected-row');
                }
                const respObj = configuracoes.responsaveis.find(r => r.nome === d.responsavel);
                const meioObj = configuracoes.meios.find(m => m.nome === d.meio);
                const quemObj = configuracoes.comQuem ? configuracoes.comQuem.find(q => (q.nome || q) === d.comQuem) : null;

                const respStyle = respObj && respObj.cor ? `style="background-color: ${respObj.cor}; color: #fff; border: none;"` : 'class="pill pill-red"';
                const meioStyle = meioObj && meioObj.cor ? `style="background-color: ${meioObj.cor}; color: #fff; border: none;"` : 'class="pill pill-blue"';
                const quemStyle = quemObj && quemObj.cor ? `style="background-color: ${quemObj.cor}; color: #fff; border: none;"` : 'class="pill pill-black"';

                tr.innerHTML = `
                    <td style="text-align: center;">
                        <input type="checkbox" class="row-checkbox" value="${d.id}" ${selectedIds.includes(d.id) ? 'checked' : ''}>
                    </td>
                    <td><span class="pill" ${respStyle}>${d.responsavel}</span></td>
                    <td>${d.assessor}</td>
                    <td>${d.cliente}</td>
                    <td>${d.demanda}</td>
                    <td><span class="pill" ${meioStyle}>${d.meio}</span></td>
                    <td>${d.protocolo || '-'}</td>
                    <td>${d.comentarios || '-'}</td>
                    <td><span class="pill" ${quemStyle}>${d.comQuem}</span></td>
                    <td><i class="ph ph-calendar-blank"></i> ${formatDate(d.data)}</td>
                    <td>
                        <div class="action-icons">
                            <i class="ph ph-pencil-simple" title="Editar" onclick="editDemanda('${d.id}')"></i>
                            <i class="ph ph-arrows-left-right" title="Transferir para o Histórico" onclick="transferirDemanda('${d.id}')"></i>
                            <i class="ph ph-trash" title="Excluir" onclick="deleteDemanda('${d.id}')"></i>
                        </div>
                    </td>
                `;
                tableBody.appendChild(tr);
            });
            countBadge.textContent = `(${sourceData.length})`;
            renderPagination('paginationAbertasContainer', 'abertas', sourceData.length, limit, renderTables);

        } else if (currentPage === 'historico') {
            historicoTableBody.innerHTML = '';

            pagedData.forEach((d) => {
                const tr = document.createElement('tr');
                if (selectedIds.includes(d.id)) {
                    tr.classList.add('selected-row');
                }
                const respObj = configuracoes.responsaveis.find(r => r.nome === d.responsavel);
                const meioObj = configuracoes.meios.find(m => m.nome === d.meio);

                const respStyle = respObj && respObj.cor ? `style="background-color: ${respObj.cor}; color: #fff; border: none;"` : 'class="pill pill-red"';
                const meioStyle = meioObj && meioObj.cor ? `style="background-color: ${meioObj.cor}; color: #fff; border: none;"` : 'class="pill pill-blue"';

                tr.innerHTML = `
                    <td style="text-align: center;">
                        <input type="checkbox" class="row-checkbox" value="${d.id}" ${selectedIds.includes(d.id) ? 'checked' : ''}>
                    </td>
                    <td><span class="pill" ${respStyle}>${d.responsavel}</span></td>
                    <td>${d.assessor}</td>
                    <td>${d.cliente}</td>
                    <td>${d.demanda}</td>
                    <td><span class="pill" ${meioStyle}>${d.meio}</span></td>
                    <td>${d.protocolo || '-'}</td>
                    <td>${d.comentarios || '-'}</td>
                    <td><i class="ph ph-calendar-blank"></i> ${formatDate(d.data)}</td>
                    <td><i class="ph ph-calendar-blank"></i> ${formatDate(d.dataEncerramento)}</td>
                    <td>
                        <div class="action-icons">
                            <i class="ph ph-pencil-simple" title="Editar" onclick="editDemanda('${d.id}')"></i>
                            <i class="ph ph-arrows-left-right" title="Retornar para Abertas" onclick="transferirDemanda('${d.id}')"></i>
                            <i class="ph ph-trash" title="Excluir" onclick="deleteDemanda('${d.id}')"></i>
                        </div>
                    </td>
                `;
                historicoTableBody.appendChild(tr);
            });
            countBadge.textContent = `(${sourceData.length})`;
            renderPagination('paginationHistoricoContainer', 'historico', sourceData.length, limit, renderTables);
        }

        // Atualizar ícones de ordenação
        tableHeaders.forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            const icon = th.querySelector('i');
            if (icon) icon.className = 'ph ph-caret-up-down';

            if (th.dataset.col === sortConfig.column) {
                th.classList.add(sortConfig.direction === 'asc' ? 'sort-asc' : 'sort-desc');
                if (icon) icon.className = sortConfig.direction === 'asc' ? 'ph ph-caret-up' : 'ph ph-caret-down';
            }
        });
        // Atualizar checkbox master
        updateSelectAllCheckboxState(pagedData);
    };

    // ==========================================
    // Lógica de Seleção Múltipla (Checkboxes)
    // ==========================================
    const updateBulkActionsVisibility = () => {
        if (selectedIds.length > 0) {
            bulkActionsContainer.style.display = 'flex';
            bulkSelectedCount.textContent = selectedIds.length;
        } else {
            bulkActionsContainer.style.display = 'none';
        }
    };

    const updateSelectAllCheckboxState = (currentData) => {
        const selectAllBoxes = document.querySelectorAll('.select-all-checkbox');
        if (currentData.length === 0) {
            selectAllBoxes.forEach(cb => { cb.checked = false; cb.indeterminate = false; });
            return;
        }

        const allOnPageSelected = currentData.every(d => selectedIds.includes(d.id));
        const someOnPageSelected = currentData.some(d => selectedIds.includes(d.id));

        selectAllBoxes.forEach(cb => {
            cb.checked = allOnPageSelected;
            cb.indeterminate = !allOnPageSelected && someOnPageSelected;
        });
    };

    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('row-checkbox')) {
            const id = e.target.value;
            if (e.target.checked) {
                if (!selectedIds.includes(id)) selectedIds.push(id);
            } else {
                selectedIds = selectedIds.filter(i => i !== id);
            }
            updateBulkActionsVisibility();
            renderTables(); // Re-render to update row styles and master checkbox
        }

        if (e.target.classList.contains('select-all-checkbox')) {
            const isChecked = e.target.checked;
            const fullData = currentPage === 'abertas' ? applyFiltersAndSort([...demandas]) : applyFiltersAndSort([...historico]);
            const isAbertas = currentPage === 'abertas';
            const pageKey = isAbertas ? 'abertas' : 'historico';
            const limit = isAbertas ? 50 : 100;
            const start = (paginationState[pageKey] - 1) * limit;
            const sourceData = fullData.slice(start, start + limit);

            if (isChecked) {
                sourceData.forEach(d => {
                    if (!selectedIds.includes(d.id)) selectedIds.push(d.id);
                });
            } else {
                sourceData.forEach(d => {
                    selectedIds = selectedIds.filter(i => i !== d.id);
                });
            }
            updateBulkActionsVisibility();
            renderTables();
        }
    });

    // ==========================================
    // Ações globais (Individuais e em Lote)
    // ==========================================
    window.deleteDemanda = (id) => {
        openDeleteModal(id);
    };

    const modalBulkExcluir = document.getElementById('modalBulkExcluir');
    const modalBulkTransferir = document.getElementById('modalBulkTransferir');

    if (btnBulkExcluir) {
        btnBulkExcluir.addEventListener('click', () => {
            document.getElementById('bulkDeleteCountText').textContent = selectedIds.length;
            modalBulkExcluir.classList.add('active');
        });
    }

    const btnCancelBulkDemandas = document.getElementById('btnCancelBulkDemandas');
    if (btnCancelBulkDemandas) {
        btnCancelBulkDemandas.addEventListener('click', () => {
            selectedIds = [];
            updateBulkActionsVisibility();
            document.querySelectorAll('.select-all-checkbox').forEach(cb => {
                cb.checked = false;
                cb.indeterminate = false;
            });
            renderTables();
        });
    }

    document.getElementById('btnCancelBulkDelete').addEventListener('click', () => {
        modalBulkExcluir.classList.remove('active');
    });

    document.getElementById('btnConfirmBulkDelete').addEventListener('click', async () => {
        const btn = document.getElementById('btnConfirmBulkDelete');
        btn.textContent = 'Aguarde...';
        btn.disabled = true;

        try {
            const collectionName = currentPage === 'abertas' ? 'demandas' : 'historico';

            const chunkSize = 10;
            for (let i = 0; i < selectedIds.length; i += chunkSize) {
                const chunk = selectedIds.slice(i, i + chunkSize);
                const { error: _errBulk } = await supabaseClient.from(collectionName).delete().in('id', chunk);
                if (_errBulk) throw _errBulk;
            }

            registrarLog('Excluiu Demandas em Lote', `Excluiu ${selectedIds.length} demandas da aba ${collectionName}.`);

            selectedIds = [];
            updateBulkActionsVisibility();
            modalBulkExcluir.classList.remove('active');
            await forceDataRefresh();
        } catch (error) {
            console.error("Erro ao excluir em lote:", error);
            showToast(`Erro ao excluir demandas. Tente novamente.. Detalhe: ${(typeof error !== "undefined" && error) ? error.message : "Desconhecido"}`, 'info');
        } finally {
            btn.textContent = 'Excluir';
            btn.disabled = false;
        }
    });

    if (btnBulkTransferir) {
        btnBulkTransferir.addEventListener('click', () => {
            document.getElementById('bulkTransferCountText').textContent = selectedIds.length;
            document.getElementById('inputBulkDataEncerramento').value = new Date().toISOString().split('T')[0];

            if (currentPage === 'abertas') {
                document.getElementById('groupBulkMotivoEncerramento').style.display = 'block';
                document.getElementById('inputBulkMotivoEncerramento').value = '';
            } else {
                document.getElementById('groupBulkMotivoEncerramento').style.display = 'none';
            }
            modalBulkTransferir.classList.add('active');
        });
    }

    document.getElementById('btnCancelBulkTransfer').addEventListener('click', () => {
        modalBulkTransferir.classList.remove('active');
    });

    document.getElementById('btnConfirmBulkTransfer').addEventListener('click', async () => {
        const btn = document.getElementById('btnConfirmBulkTransfer');
        const dataEncerramento = document.getElementById('inputBulkDataEncerramento').value;
        const motivoEncerramento = document.getElementById('inputBulkMotivoEncerramento').value;

        // Removido texto obrigatório ao transferir em lote

        btn.textContent = 'Aguarde...';
        btn.disabled = true;

        try {
            if (currentPage === 'abertas') {
                const historicoItems = [];
                const idsToDelete = [];
                selectedIds.forEach(id => {
                    const demanda = demandas.find(d => d.id === id);
                    if (demanda) {
                        const demandaTransferida = { ...demanda, dataEncerramento: dataEncerramento };
                        delete demandaTransferida.id;
                        delete demandaTransferida.created_at;
                        if (motivoEncerramento && motivoEncerramento.trim() !== "") {
                            demandaTransferida.comentarios = motivoEncerramento;
                        }
                        historicoItems.push(demandaTransferida);
                        idsToDelete.push(id);
                    }
                });
                if (historicoItems.length > 0) {
                    const { error: _errBulkInsert1 } = await supabaseClient.from("historico").insert(historicoItems);
                    if (_errBulkInsert1) throw _errBulkInsert1;

                    const chunkSize = 10;
                    for (let i = 0; i < idsToDelete.length; i += chunkSize) {
                        const chunk = idsToDelete.slice(i, i + chunkSize);
                        const { error: _errT1 } = await supabaseClient.from("demandas").delete().in("id", chunk);
                        if (_errT1) throw _errT1;
                    }
                }
                registrarLog('Transferiu Demandas em Lote', `Transferiu ${selectedIds.length} demandas para o histórico.`);
            } else {
                const demandaItems = [];
                const idsToDelete = [];
                selectedIds.forEach(id => {
                    const historicoItem = historico.find(d => d.id === id);
                    if (historicoItem) {
                        const demandaRetornada = { ...historicoItem };
                        delete demandaRetornada.id;
                        delete demandaRetornada.created_at;
                        delete demandaRetornada.dataEncerramento;
                        delete demandaRetornada.motivoEncerramento;
                        delete demandaRetornada.timestampEncerramento;
                        delete demandaRetornada.originalId;

                        demandaItems.push(demandaRetornada);
                        idsToDelete.push(id);
                    }
                });
                if (demandaItems.length > 0) {
                    const { error: _errBulkInsert2 } = await supabaseClient.from("demandas").insert(demandaItems);
                    if (_errBulkInsert2) throw _errBulkInsert2;

                    const chunkSize = 10;
                    for (let i = 0; i < idsToDelete.length; i += chunkSize) {
                        const chunk = idsToDelete.slice(i, i + chunkSize);
                        const { error: _errT2 } = await supabaseClient.from("historico").delete().in("id", chunk);
                        if (_errT2) throw _errT2;
                    }
                }
                registrarLog('Retornou Demandas em Lote', `Retornou ${selectedIds.length} demandas para Abertas.`);
            }
            selectedIds = [];
            updateBulkActionsVisibility();
            modalBulkTransferir.classList.remove('active');
            const { data: dData } = await supabaseClient.from('demandas').select('*');
            if (dData) demandas = dData;
            const { data: hData } = await supabaseClient.from('historico').select('*');
            if (hData) historico = hData;
            renderTables();

            showToast('Transferência em lote concluída', 'success');
        } catch (error) {
            console.error("Erro na transferência em lote:", error);
            showToast(`Erro ao transferir demandas. Tente novamente.. Detalhe: ${(typeof error !== "undefined" && error) ? error.message : "Desconhecido"}`, 'info');
        } finally {
            btn.textContent = 'Transferir';
            btn.disabled = false;
        }
    });

    window.transferirDemanda = (id) => {
        openTransferModal(id);
    };

    window.editDemanda = (id) => {
        const sourceList = currentPage === 'abertas' ? demandas : historico;
        const demanda = sourceList.find(d => d.id === id);
        if (demanda) {
            editingId = id;
            if (tsResponsavel) tsResponsavel.setValue(demanda.responsavel || '');
            else document.getElementById('inputResponsavel').value = demanda.responsavel;

            if (tsAssessor) tsAssessor.setValue(demanda.assessor || '');
            else document.getElementById('inputAssessor').value = demanda.assessor;

            document.getElementById('inputCliente').value = demanda.cliente;
            document.getElementById('inputDemanda').value = demanda.demanda;
            document.getElementById('inputMeio').value = demanda.meio === '-' ? '' : demanda.meio;
            document.getElementById('inputProtocolo').value = demanda.protocolo === '-' ? '' : demanda.protocolo;
            document.getElementById('inputComentarios').value = demanda.comentarios === '-' ? '' : demanda.comentarios;
            document.getElementById('inputComQuem').value = demanda.comQuem === '-' ? '' : demanda.comQuem;
            document.getElementById('inputData').value = demanda.data;

            document.querySelector('#modalNovaDemanda h2').textContent = 'Editar Demanda';
            document.querySelector('#formNovaDemanda .btn-submit').textContent = 'Salvar Alterações';

            openModal();
        }
    };

    // ==========================================
    // Eventos de Busca, Ordenação, Filtros e Exportação
    // ==========================================

    inputBuscar.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderTables();
    });

    filterResponsavel.addEventListener('change', (e) => {
        selectedResponsavel = e.target.value;
        renderTables();
    });

    filterMeio.addEventListener('change', (e) => {
        selectedMeio = e.target.value;
        renderTables();
    });

    btnReset.addEventListener('click', () => {
        searchQuery = '';
        inputBuscar.value = '';
        selectedResponsavel = '';
        selectedMeio = '';
        selectedDateInicio = null;
        selectedDateFim = null;
        filterResponsavel.value = '';
        filterMeio.value = '';
        if (window.datePickerInstance) {
            window.datePickerInstance.clear();
            document.getElementById('dateFilterValue').textContent = 'Período...';
        }
        sortConfig = { column: 'data', direction: 'desc' };
        renderTables();
    });

    // Configurar Date Picker
    const btnDateFilter = document.getElementById('btnDateFilter');
    const dateFilterValue = document.getElementById('dateFilterValue');

    // Select all logs
    const selectAllLogs = document.getElementById('selectAllLogs');
    if (selectAllLogs) {
        selectAllLogs.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            const tbody = document.getElementById('logTableBody');
            const checkboxes = tbody.querySelectorAll('.log-checkbox');

            checkboxes.forEach(cb => {
                cb.checked = isChecked;
                const val = cb.value;
                if (isChecked && !selectedLogsIds.includes(val)) {
                    selectedLogsIds.push(val);
                } else if (!isChecked) {
                    selectedLogsIds = selectedLogsIds.filter(id => id !== val);
                }
            });
            renderLogs();
            updateLogsBulkVisibility();
        });
    }

    const btnBulkExcluirLogs = document.getElementById('btnBulkExcluirLogs');
    if (btnBulkExcluirLogs) {
        btnBulkExcluirLogs.addEventListener('click', async () => {
            if (selectedLogsIds.length === 0) return;
            currentLogDeleteAction = 'bulk';
            const modal = document.getElementById('modalExcluirLog');
            const text = document.getElementById('modalDeleteLogText');
            if (text) text.textContent = `Você tem certeza que quer deletar ${selectedLogsIds.length} registros do histórico?`;
            if (modal) modal.classList.add('active');
        });
    }

    const btnCancelBulkLogs = document.getElementById('btnCancelBulkLogs');
    if (btnCancelBulkLogs) {
        btnCancelBulkLogs.addEventListener('click', () => {
            selectedLogsIds = [];
            if (typeof updateLogsBulkVisibility === 'function') updateLogsBulkVisibility();
            document.querySelectorAll('#viewLog .select-all-checkbox').forEach(cb => {
                cb.checked = false;
                cb.indeterminate = false;
            });
            if (typeof renderLogs === 'function') renderLogs();
        });
    }

    const inputBuscarLogs = document.getElementById('inputBuscarLogs');
    if (inputBuscarLogs) {
        inputBuscarLogs.addEventListener('input', (e) => {
            searchLogsQuery = e.target.value;
            renderLogs();
        });
    }

    const btnResetLogs = document.getElementById('btnResetLogs');
    if (btnResetLogs) {
        btnResetLogs.addEventListener('click', () => {
            searchLogsQuery = '';
            inputBuscarLogs.value = '';
            selectedLogsDateInicio = null;
            selectedLogsDateFim = null;
            selectedLogsIds = [];
            updateLogsBulkVisibility();
            if (window.datePickerLogsInstance) {
                window.datePickerLogsInstance.clear();
                document.getElementById('dateFilterValueLogs').textContent = 'Período...';
            }
            renderLogs();
        });
    }

    // Flatpickr logs
    const filterDateRangeLogs = document.getElementById('filterDateRangeLogs');
    if (filterDateRangeLogs) {
        window.datePickerLogsInstance = flatpickr(filterDateRangeLogs, {
            mode: "range",
            dateFormat: "d/m/Y",
            locale: "pt",
            positionElement: document.getElementById('btnDateFilterLogs'),
            onChange: function (selectedDates, dateStr, instance) {
                if (selectedDates.length === 2) {
                    selectedLogsDateInicio = selectedDates[0];
                    selectedLogsDateInicio.setHours(0, 0, 0, 0);
                    selectedLogsDateFim = selectedDates[1];
                    selectedLogsDateFim.setHours(23, 59, 59, 999);
                    document.getElementById('dateFilterValueLogs').textContent = dateStr;
                    renderLogs();
                } else if (selectedDates.length === 0) {
                    selectedLogsDateInicio = null;
                    selectedLogsDateFim = null;
                    document.getElementById('dateFilterValueLogs').textContent = 'Período...';
                    renderLogs();
                }
            }
        });

        const btnDateFilterLogs = document.getElementById('btnDateFilterLogs');
        if (btnDateFilterLogs) {
            btnDateFilterLogs.addEventListener('click', () => {
                window.datePickerLogsInstance.open();
            });
        }
    }
    const filterDateRange = document.getElementById('filterDateRange');

    if (btnDateFilter && filterDateRange) {
        window.datePickerInstance = flatpickr(filterDateRange, {
            mode: "range",
            dateFormat: "Y-m-d",
            locale: "pt",
            positionElement: btnDateFilter,
            onChange: function (selectedDates, dateStr, instance) {
                if (selectedDates.length === 2) {
                    selectedDateInicio = instance.formatDate(selectedDates[0], "Y-m-d");
                    selectedDateFim = instance.formatDate(selectedDates[1], "Y-m-d");

                    const formatBr = (date) => instance.formatDate(date, "d/m/Y");
                    dateFilterValue.textContent = `${formatBr(selectedDates[0])} - ${formatBr(selectedDates[1])}`;

                    renderTables();
                } else if (selectedDates.length === 0) {
                    selectedDateInicio = null;
                    selectedDateFim = null;
                    dateFilterValue.textContent = 'Período...';
                    renderTables();
                }
            }
        });

        btnDateFilter.addEventListener('click', () => {
            window.datePickerInstance.open();
        });
    }

    tableHeaders.forEach(th => {
        th.addEventListener('click', () => {
            // Only handle click for visible columns
            if (th.closest('.table-container').style.display === 'none') return;

            const column = th.dataset.col;
            if (sortConfig.column === column) {
                sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
            } else {
                sortConfig.column = column;
                sortConfig.direction = 'asc';
            }
            renderTables();
        });
    });

    btnExport.addEventListener('click', () => {
        const sourceData = currentPage === 'abertas' ? [...demandas] : [...historico];
        const dataToExport = applyFiltersAndSort(sourceData);

        let headers = [];
        if (currentPage === 'abertas') {
            headers = ['Responsável', 'Assessor', 'Cliente', 'Demanda', 'Meio', 'Protocolo', 'Comentários', 'Com Quem?', 'Data'];
        } else {
            headers = ['Responsável', 'Assessor', 'Cliente', 'Demanda', 'Meio', 'Protocolo', 'Comentários', 'Data', 'Data de encerramento'];
        }

        // Criar estrutura de tabela HTML para suportar cores no Excel
        let htmlContent = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
        htmlContent += '<head><meta charset="UTF-8"></head><body>';
        htmlContent += '<table border="1">';

        // Header da tabela
        htmlContent += '<tr>';
        headers.forEach(h => {
            htmlContent += `<th style="background-color: #f1f1f1; font-weight: bold;">${h}</th>`;
        });
        htmlContent += '</tr>';

        dataToExport.forEach(d => {
            // Pegar as cores das configurações
            const respObj = configuracoes.responsaveis.find(r => r.nome === d.responsavel);
            const meioObj = configuracoes.meios.find(m => m.nome === d.meio);

            const respBg = respObj && respObj.cor ? respObj.cor : '';
            const meioBg = meioObj && meioObj.cor ? meioObj.cor : '';

            const respStyle = respBg ? `style="background-color: ${respBg}; color: #ffffff;"` : '';
            const meioStyle = meioBg ? `style="background-color: ${meioBg}; color: #ffffff;"` : '';

            htmlContent += '<tr>';
            htmlContent += `<td ${respStyle}>${d.responsavel || '-'}</td>`;
            htmlContent += `<td>${d.assessor || '-'}</td>`;
            htmlContent += `<td>${d.cliente || '-'}</td>`;
            htmlContent += `<td>${d.demanda || '-'}</td>`;
            htmlContent += `<td ${meioStyle}>${d.meio || '-'}</td>`;
            htmlContent += `<td>${d.protocolo || '-'}</td>`;
            htmlContent += `<td>${d.comentarios || '-'}</td>`;

            if (currentPage === 'abertas') {
                htmlContent += `<td>${d.comQuem || '-'}</td>`;
                htmlContent += `<td>${formatDate(d.data)}</td>`;
            } else {
                htmlContent += `<td>${formatDate(d.data)}</td>`;
                htmlContent += `<td>${formatDate(d.dataEncerramento)}</td>`;
            }
            htmlContent += '</tr>';
        });

        htmlContent += '</table></body></html>';

        const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", currentPage === 'abertas' ? "demandas.xls" : "historico_demandas.xls");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // ==========================================
    // Adicionar/Editar Demanda
    // ==========================================
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btnSubmit = form.querySelector('.btn-submit');
        const originalText = btnSubmit.textContent;
        btnSubmit.textContent = "Aguarde...";
        btnSubmit.disabled = true;

        const dadosFormulario = {
            responsavel: document.getElementById('inputResponsavel').value,
            assessor: document.getElementById('inputAssessor').value,
            cliente: document.getElementById('inputCliente').value,
            demanda: document.getElementById('inputDemanda').value,
            meio: document.getElementById('inputMeio').value || '-',
            protocolo: document.getElementById('inputProtocolo').value || '-',
            comentarios: document.getElementById('inputComentarios').value || '-',
            comQuem: document.getElementById('inputComQuem').value || '-',
            data: document.getElementById('inputData').value
        };

        try {
            if (editingId) {
                const collectionName = currentPage === 'abertas' ? "demandas" : "historico";
                await supabaseClient.from(collectionName).update(dadosFormulario).eq("id", String(editingId));
                registrarLog('Editou Demanda', `Demanda "${dadosFormulario.demanda}" do cliente ${dadosFormulario.cliente} foi editada.`);
                showToast("Demanda editada com sucesso!", "success");
            } else {
                await supabaseClient.from("demandas").insert([dadosFormulario]);
                registrarLog('Criou Demanda', `Nova demanda "${dadosFormulario.demanda}" criada para o cliente ${dadosFormulario.cliente}.`);
                showToast("Demanda criada com sucesso!", "success");
            }
            closeModal();
            await forceDataRefresh();
        } catch (error) {
            console.error("Erro ao salvar demanda:", error);
            showToast(`Erro ao salvar demanda. Tente novamente.. Detalhe: ${(typeof error !== "undefined" && error) ? error.message : "Desconhecido"}`, 'info');
        }

        btnSubmit.textContent = originalText;
        btnSubmit.disabled = false;
    });

    // ==========================================
    // Funções de Controle de Opções
    // ==========================================
    let tsResponsavel = null;
    let tsAssessor = null;

    const renderSelectOptions = () => {
        const selResp = document.getElementById('inputResponsavel');
        const selAssessor = document.getElementById('inputAssessor');
        const selMeio = document.getElementById('inputMeio');
        const selComQuem = document.getElementById('inputComQuem');

        if (selResp) {
            if (tsResponsavel) { tsResponsavel.destroy(); tsResponsavel = null; }
            const val = selResp.value;
            selResp.innerHTML = '<option value="">Selecione</option>';
            configuracoes.responsaveis.forEach(o => selResp.innerHTML += `<option value="${o.nome}">${o.nome}</option>`);
            selResp.value = val;
            tsResponsavel = new TomSelect('#inputResponsavel', { create: false, sortField: { field: "text", direction: "asc" }, maxOptions: null });
        }
        if (selAssessor) {
            if (tsAssessor) { tsAssessor.destroy(); tsAssessor = null; }
            const val = selAssessor.value;
            selAssessor.innerHTML = '<option value="">Selecione</option>';
            configuracoes.assessores.forEach(o => selAssessor.innerHTML += `<option value="${o.nome || o}">${o.nome || o}</option>`);
            selAssessor.value = val;
            tsAssessor = new TomSelect('#inputAssessor', { create: false, sortField: { field: "text", direction: "asc" }, maxOptions: null });
        }
        if (selMeio) {
            const val = selMeio.value;
            selMeio.innerHTML = '<option value="">Selecione</option>';
            configuracoes.meios.forEach(o => selMeio.innerHTML += `<option value="${o.nome}">${o.nome}</option>`);
            selMeio.value = val;
        }
        if (selComQuem) {
            const val = selComQuem.value;
            selComQuem.innerHTML = '<option value="">Selecione</option>';
            if (configuracoes.comQuem) {
                configuracoes.comQuem.forEach(o => selComQuem.innerHTML += `<option value="${o.nome}">${o.nome}</option>`);
            }
            selComQuem.value = val;
        }
    };

    const selectAllControle = document.getElementById('selectAllControle');
    const btnBulkExcluirControle = document.getElementById('btnBulkExcluirControle');
    const bulkActionsContainerControle = document.getElementById('bulkActionsContainerControle');
    const bulkSelectedCountControle = document.getElementById('bulkSelectedCountControle');
    const btnCancelBulkControle = document.getElementById('btnCancelBulkControle');

    const updateBulkActionsControle = () => {
        const checkboxes = document.querySelectorAll('.row-checkbox-controle:checked');
        if (checkboxes.length > 0) {
            if (bulkActionsContainerControle) bulkActionsContainerControle.style.display = 'flex';
            if (bulkSelectedCountControle) bulkSelectedCountControle.textContent = checkboxes.length;
        } else {
            if (bulkActionsContainerControle) bulkActionsContainerControle.style.display = 'none';
        }
    };
    window.updateBulkActionsControle = updateBulkActionsControle;

    if (selectAllControle) {
        selectAllControle.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            document.querySelectorAll('.row-checkbox-controle').forEach(cb => {
                cb.checked = isChecked;
            });
            updateBulkActionsControle();
        });
    }

    if (btnCancelBulkControle) {
        btnCancelBulkControle.addEventListener('click', () => {
            if (selectAllControle) selectAllControle.checked = false;
            document.querySelectorAll('.row-checkbox-controle').forEach(cb => cb.checked = false);
            updateBulkActionsControle();
        });
    }

    if (btnBulkExcluirControle) {
        btnBulkExcluirControle.addEventListener('click', async () => {
            const checkboxes = document.querySelectorAll('.row-checkbox-controle:checked');
            if (checkboxes.length === 0) {
                showToast('Selecione pelo menos um item para excluir', 'warning');
                return;
            }

            const confirmModal = document.getElementById('modalExcluirOpcaoControle');
            const deleteText = document.getElementById('modalDeleteOpcaoControleText');
            if (!confirmModal || !deleteText) return;

            const categoria = document.getElementById('selectCategoriaControle').value;
            deleteText.textContent = `Tem certeza que deseja excluir os ${checkboxes.length} itens selecionados?`;

            const btnConfirm = document.getElementById('btnConfirmDeleteOpcaoControle');
            const clone = btnConfirm.cloneNode(true);
            btnConfirm.parentNode.replaceChild(clone, btnConfirm);

            clone.addEventListener('click', async () => {
                clone.disabled = true;
                clone.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';

                try {
                    const indicesToRemove = Array.from(checkboxes).map(cb => parseInt(cb.value)).sort((a, b) => b - a);

                    indicesToRemove.forEach(index => {
                        configuracoes[categoria].splice(index, 1);
                    });

                    const { error } = await supabaseClient.from('configuracoes').upsert([{ id: 'geral', dados: configuracoes }]);
                    if (error) throw error;

                    showToast(`${indicesToRemove.length} itens excluídos com sucesso!`, 'success');
                    window.renderControleTable();
                    renderSelectOptions();
                    confirmModal.classList.remove('active');
                } catch (error) {
                    console.error("Erro ao excluir itens em lote:", error);
                    showToast('Erro ao excluir itens. Tente novamente.', 'error');
                } finally {
                    clone.disabled = false;
                    clone.textContent = 'Excluir';
                }
            });

            confirmModal.classList.add('active');
        });
    }

    const bindCheckboxEventsControle = () => {
        document.querySelectorAll('.row-checkbox-controle').forEach(cb => {
            cb.addEventListener('change', updateBulkActionsControle);
        });
    };

    window.renderControleTable = () => {
        try {
            const tbody = document.getElementById('controleTableBody');
            const selectCat = document.getElementById('selectCategoriaControle');
            const searchInput = document.getElementById('inputBuscarControle');
            const thCor = document.getElementById('thCorControle');
            const btnLote = document.getElementById('btnLoteAssessoresControle');

            if (!tbody || !selectCat) return;

            const categoria = selectCat.value;
            let items = [];
            if (configuracoes && configuracoes[categoria]) {
                items = [...configuracoes[categoria]].filter(Boolean);
            }

            const thCheckbox = document.getElementById('thCheckboxControle');

            // Hide Lote and Cor if it's assessores
            if (categoria === 'assessores') {
                if (btnLote) btnLote.style.display = 'block';
                if (thCor) thCor.style.display = 'none';
                if (thCheckbox) thCheckbox.style.display = 'table-cell';
            } else {
                if (btnLote) btnLote.style.display = 'none';
                if (thCor) thCor.style.display = 'table-cell';
                if (thCheckbox) thCheckbox.style.display = 'none';
            }
            if (bulkActionsContainerControle) bulkActionsContainerControle.style.display = 'none';
            if (selectAllControle) selectAllControle.checked = false;

            const query = (searchInput.value || '').toLowerCase();
            if (query) {
                items = items.filter(i => {
                    if (!i) return false;
                    const val = i.nome !== undefined ? i.nome : i;
                    return String(val).toLowerCase().includes(query);
                });
            }

            tbody.innerHTML = '';
            if (items.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding: 20px;">Nenhum item encontrado.</td></tr>';
                renderPagination('paginationControleContainer', 'controle', 0, 100, window.renderControleTable);
                return;
            }

            const formatDateControle = (d) => {
                if (!d) return '-';
                const dateObj = new Date(d);
                if (isNaN(dateObj.getTime())) return d;
                return `${dateObj.toLocaleDateString('pt-BR')} às ${dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
            };

            const limit = 100;
            const totalPages = Math.ceil(items.length / limit) || 1;
            if (paginationState.controle > totalPages) paginationState.controle = totalPages;
            const start = (paginationState.controle - 1) * limit;
            const pagedItems = items.slice(start, start + limit);

            pagedItems.forEach((item, index) => {
                if (!item) return;
                const tr = document.createElement('tr');

                const nome = item.nome !== undefined ? item.nome : item;
                const cor = item.cor ? `<div style="width: 14px; height: 14px; border-radius: 50%; background-color: ${item.cor}; border: 1px solid rgba(255,255,255,0.2);"></div>` : '-';

                const criadoEm = formatDateControle(item.criadoEm);
                const atualizadoEm = formatDateControle(item.atualizadoEm);

                // For the original index in the true array if filtered/paginated:
                const originalIndex = configuracoes[categoria].indexOf(item);
                const actionIndex = originalIndex > -1 ? originalIndex : (start + index);

                if (categoria === 'assessores') {
                    tr.innerHTML = `
                        <td style="text-align: center;"><input type="checkbox" class="row-checkbox-controle" value="${actionIndex}"></td>
                        <td>${nome}</td>
                        <td>${criadoEm}</td>
                        <td>${atualizadoEm}</td>
                        <td>
                            <div class="action-icons">
                                <i class="ph ph-pencil-simple" title="Editar" onclick="window.openEditControleModal('${categoria}', ${actionIndex})"></i>
                                <i class="ph ph-trash" title="Remover" onclick="window.openDeleteControleModal('${categoria}', ${actionIndex})"></i>
                            </div>
                        </td>
                    `;
                } else {
                    tr.innerHTML = `
                        <td>${nome}</td>
                        <td><div style="display:flex;">${cor}</div></td>
                        <td>${criadoEm}</td>
                        <td>${atualizadoEm}</td>
                        <td>
                            <div class="action-icons">
                                <i class="ph ph-pencil-simple" title="Editar" onclick="window.openEditControleModal('${categoria}', ${actionIndex})"></i>
                                <i class="ph ph-trash" title="Remover" onclick="window.openDeleteControleModal('${categoria}', ${actionIndex})"></i>
                            </div>
                        </td>
                    `;
                }
                tbody.appendChild(tr);
            });
            bindCheckboxEventsControle();
            renderPagination('paginationControleContainer', 'controle', items.length, limit, window.renderControleTable);
        } catch (e) {
            console.error("Erro no renderControleTable: ", e);
            const tbody = document.getElementById('controleTableBody');
            if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding: 20px; color: red;">Erro ao renderizar dados. Verifique o console.</td></tr>`;
        }
    };

    if (document.getElementById('selectCategoriaControle')) {
        document.getElementById('selectCategoriaControle').addEventListener('change', () => {
            const inputBuscar = document.getElementById('inputBuscarControle');
            if (inputBuscar) inputBuscar.value = '';
            window.renderControleTable();
        });
    }
    if (document.getElementById('inputBuscarControle')) {
        document.getElementById('inputBuscarControle').addEventListener('input', window.renderControleTable);
    }
    if (document.getElementById('btnResetControle')) {
        document.getElementById('btnResetControle').addEventListener('click', () => {
            document.getElementById('inputBuscarControle').value = '';
            window.renderControleTable();
        });
    }
    if (document.getElementById('btnNovaOpcaoControle')) {
        document.getElementById('btnNovaOpcaoControle').addEventListener('click', () => {
            const cat = document.getElementById('selectCategoriaControle').value;
            window.openEditControleModal(cat, null); // null index means "new"
        });
    }

    // Modal de Edição de Controle (Serve para Novo e Editar)
    const modalEditarOpcao = document.getElementById('modalEditarOpcao');
    const inputEditarOpcao = document.getElementById('inputEditarOpcao');
    const btnCancelEditarOpcao = document.getElementById('btnCancelEditarOpcao');
    const btnConfirmEditarOpcao = document.getElementById('btnConfirmEditarOpcao');
    const titleEditarOpcao = document.getElementById('titleEditarOpcao');

    // Modal de Lote de Assessores
    const modalLoteAssessores = document.getElementById('modalLoteAssessores');
    const btnCancelLoteAssessores = document.getElementById('btnCancelLoteAssessores');
    const btnCloseLoteAssessores = document.getElementById('btnCloseLoteAssessores');
    const formLoteAssessores = document.getElementById('formLoteAssessores');

    window.openLoteAssessoresModal = () => {
        document.getElementById('inputListaAssessores').value = '';
        modalLoteAssessores.classList.add('active');
    };

    if (document.getElementById('btnLoteAssessoresControle')) {
        document.getElementById('btnLoteAssessoresControle').addEventListener('click', window.openLoteAssessoresModal);
    }

    const closeLoteAssessoresModal = () => {
        modalLoteAssessores.classList.remove('active');
    };

    if (btnCloseLoteAssessores) btnCloseLoteAssessores.addEventListener('click', closeLoteAssessoresModal);
    if (btnCancelLoteAssessores) btnCancelLoteAssessores.addEventListener('click', closeLoteAssessoresModal);

    if (formLoteAssessores) {
        formLoteAssessores.addEventListener('submit', async (e) => {
            e.preventDefault();

            const btnSubmit = formLoteAssessores.querySelector('.btn-submit');
            const originalText = btnSubmit.textContent;
            btnSubmit.textContent = "Aguarde...";
            btnSubmit.disabled = true;

            const text = document.getElementById('inputListaAssessores').value;
            const nomes = text.split('\n').map(n => n.trim()).filter(n => n.length > 0);

            let adicionados = 0;
            const now = new Date().toISOString();
            nomes.forEach(val => {
                if (!configuracoes.assessores.some(a => (a.nome || a).toLowerCase() === val.toLowerCase())) {
                    configuracoes.assessores.push({ nome: val, criadoEm: now, atualizadoEm: now });
                    adicionados++;
                }
            });

            if (adicionados > 0) {
                configuracoes.assessores.sort((a, b) => (a.nome || a).localeCompare(b.nome || b));
                try {
                    await supabaseClient.from("configuracoes").upsert([{ "id": "geral", "dados": configuracoes }]);
                    registrarLog('Adicionou Assessores em Lote', `Foram adicionados ${adicionados} novos assessores.`);
                    window.renderControleTable();
                    renderSelectOptions();
                    closeLoteAssessoresModal();
                } catch (error) {
                    console.error("Erro ao salvar assessores em lote:", error);
                    showToast(`Erro ao salvar. Tente novamente.. Detalhe: ${(typeof error !== "undefined" && error) ? error.message : "Desconhecido"}`, 'info');
                }
            } else {
                showToast("Nenhum nome novo encontrado (todos já estavam cadastrados).", 'info');
                closeLoteAssessoresModal();
            }

            btnSubmit.textContent = originalText;
            btnSubmit.disabled = false;
        });
    }

    window.openEditControleModal = (type, index) => {
        editControleParams = { type, index };
        const colorInput = document.getElementById('colorEditarOpcao');
        const pickrContainer = document.getElementById('pickrEditarOpcao');

        let titleName = 'Opção';
        if (type === 'responsaveis') titleName = 'Responsável';
        if (type === 'assessores') titleName = 'Assessor';
        if (type === 'meios') titleName = 'Meio';
        if (type === 'comQuem') titleName = 'Com quem';

        if (index !== null) {
            const item = configuracoes[type][index];
            inputEditarOpcao.value = item.nome || item;
            if (titleEditarOpcao) titleEditarOpcao.textContent = `Editar "${titleName}"`;
            if (btnConfirmEditarOpcao) btnConfirmEditarOpcao.textContent = 'Salvar';

            if (type === 'assessores' || type === 'guiaTipos') {
                document.getElementById('containerCorEditarOpcao').style.display = 'none';
            } else {
                document.getElementById('containerCorEditarOpcao').style.display = 'flex';
                const colorToSet = item.cor || '#8b5cf6';
                colorInput.value = colorToSet;
                if (window.pickrEditarOpcao) {
                    window.pickrEditarOpcao.setColor(colorToSet);
                }
            }
        } else {
            // New Item
            inputEditarOpcao.value = '';
            if (titleEditarOpcao) titleEditarOpcao.textContent = `Novo "${titleName}"`;
            if (btnConfirmEditarOpcao) btnConfirmEditarOpcao.textContent = 'Criar';
            if (type === 'assessores' || type === 'guiaTipos') {
                document.getElementById('containerCorEditarOpcao').style.display = 'none';
            } else {
                document.getElementById('containerCorEditarOpcao').style.display = 'flex';
                const colorToSet = '#8b5cf6';
                colorInput.value = colorToSet;
                if (window.pickrEditarOpcao) {
                    window.pickrEditarOpcao.setColor(colorToSet);
                }
            }
        }

        modalEditarOpcao.classList.add('active');
    };

    window.openDeleteControleModal = (type, index) => {
        const modalDelete = document.getElementById('modalExcluirOpcaoControle');
        const btnCancel = document.getElementById('btnCancelDeleteOpcaoControle');
        const btnConfirm = document.getElementById('btnConfirmDeleteOpcaoControle');

        if (!modalDelete) {
            // Fallback se não encontrar o modal
            if (confirm(`Tem certeza que deseja excluir esta opção?`)) {
                const oldValue = configuracoes[type][index];
                configuracoes[type].splice(index, 1);
                supabaseClient.from("configuracoes").upsert([{ "id": "geral", "dados": configuracoes }]).then(({ error }) => {
                    if (error) {
                        showToast('Erro ao excluir opção.', 'error');
                        configuracoes[type].splice(index, 0, oldValue); // revert
                    } else {
                        showToast('Opção excluída com sucesso!', 'success');
                        window.renderControleTable();
                        renderSelectOptions();
                    }
                });
            }
            return;
        }

        const handleConfirm = () => {
            const oldValue = configuracoes[type][index];
            configuracoes[type].splice(index, 1);
            supabaseClient.from("configuracoes").upsert([{ "id": "geral", "dados": configuracoes }]).then(({ error }) => {
                if (error) {
                    showToast('Erro ao excluir opção.', 'error');
                    configuracoes[type].splice(index, 0, oldValue); // revert
                } else {
                    showToast('Opção excluída com sucesso!', 'success');
                    window.renderControleTable();
                    renderSelectOptions();
                    renderTables();
                }
            });
            modalDelete.classList.remove('active');
            cleanup();
        };

        const handleCancel = () => {
            modalDelete.classList.remove('active');
            cleanup();
        };

        const cleanup = () => {
            btnConfirm.removeEventListener('click', handleConfirm);
            btnCancel.removeEventListener('click', handleCancel);
        };

        btnConfirm.addEventListener('click', handleConfirm);
        btnCancel.addEventListener('click', handleCancel);

        modalDelete.classList.add('active');
    };

    const closeEditControleModal = () => {
        modalEditarOpcao.classList.remove('active');
    };

    if (btnCancelEditarOpcao) btnCancelEditarOpcao.addEventListener('click', closeEditControleModal);
    if (document.getElementById('btnCloseEditarOpcao')) {
        document.getElementById('btnCloseEditarOpcao').addEventListener('click', closeEditControleModal);
    }

    if (btnConfirmEditarOpcao) {
        btnConfirmEditarOpcao.addEventListener('click', async () => {
            const val = inputEditarOpcao.value.trim();
            const cor = document.getElementById('colorEditarOpcao').value;
            const { type, index } = editControleParams;
            if (val && type) {
                const isNew = index === null;
                const exists = configuracoes[type].some((x, i) => (x.nome || x).toLowerCase() === val.toLowerCase() && i !== index);

                if (exists) {
                    showToast('Esta opção já existe!', 'info');
                } else {
                    const now = new Date().toISOString();
                    let oldName = null;
                    if (!isNew) {
                        oldName = configuracoes[type][index].nome;
                        if (!oldName && typeof configuracoes[type][index] === 'string') oldName = configuracoes[type][index];
                    }

                    if (type === 'assessores') {
                        if (isNew) {
                            configuracoes[type].push({ nome: val, criadoEm: now, atualizadoEm: now });
                        } else {
                            configuracoes[type][index].nome = val;
                            configuracoes[type][index].atualizadoEm = now;
                        }
                    } else {
                        if (isNew) {
                            configuracoes[type].push({ nome: val, cor: cor, criadoEm: now, atualizadoEm: now });
                        } else {
                            configuracoes[type][index].nome = val;
                            configuracoes[type][index].cor = cor;
                            configuracoes[type][index].atualizadoEm = now;
                        }
                    }
                    configuracoes[type].sort((a, b) => (a.nome || a).localeCompare(b.nome || b));

                    try {
                        // Limpa array de possíveis valores vazios (sparse arrays)
                        configuracoes[type] = configuracoes[type].filter(Boolean);
                        
                        // Cascading update if editing an existing option
                        if (!isNew && oldName) {

                            let fieldToUpdate = null;
                            if (type === 'assessores') fieldToUpdate = 'assessor';
                            else if (type === 'responsaveis') fieldToUpdate = 'responsavel';
                            else if (type === 'meios') fieldToUpdate = 'meio';

                            if (fieldToUpdate && oldName !== val) {
                                // Update all demands where this field equals oldName
                                const { error: cascadeErr } = await supabaseClient
                                    .from('demandas')
                                    .update({ [fieldToUpdate]: val })
                                    .eq(fieldToUpdate, oldName);

                                if (cascadeErr) {
                                    console.error('Erro na atualização em cascata das demandas:', cascadeErr);
                                } else {
                                    console.log(`Demandas com ${fieldToUpdate}="${oldName}" atualizadas para "${val}".`);
                                }
                            }
                        }

                        await supabaseClient.from("configuracoes").upsert([{ "id": "geral", "dados": configuracoes }]);
                        registrarLog(isNew ? 'Adicionou Opção de Controle' : 'Editou Opção de Controle', `A opção "${val}" foi modificada em ${type}.`);
                        showToast(isNew ? "Opção criada com sucesso!" : "Opção editada com sucesso!", "success");
                        window.renderControleTable();
                        renderSelectOptions();
                        renderTables(); // Apply changes to main demands table immediately
                        closeEditControleModal();
                    } catch (e) {
                        console.error("Erro ao atualizar configuração", e);
                        showToast('Erro ao atualizar.', 'error');
                    }
                }
            }
        });
    }

    // ==========================================
    // Funções de Usuários (Acessos)
    // ==========================================
    const btnToggleSenha = document.getElementById('btnToggleSenha');
    const iconToggleSenha = document.getElementById('iconToggleSenha');
    const inputUsuarioSenha = document.getElementById('inputUsuarioSenha');

    if (btnToggleSenha) {
        btnToggleSenha.addEventListener('click', () => {
            const type = inputUsuarioSenha.getAttribute('type') === 'password' ? 'text' : 'password';
            inputUsuarioSenha.setAttribute('type', type);

            // Trocar ícone
            if (type === 'text') {
                iconToggleSenha.className = 'ph ph-eye-slash';
            } else {
                iconToggleSenha.className = 'ph ph-eye';
            }
        });
    }

    const modalUsuario = document.getElementById('modalUsuario');
    const formUsuario = document.getElementById('formUsuario');
    const inputUsuarioNome = document.getElementById('inputUsuarioNome');
    const inputUsuarioEmail = document.getElementById('inputUsuarioEmail');
    const inputUsuarioNivel = document.getElementById('inputUsuarioNivel');

    let editingUsuarioId = null;

    const openUsuarioModal = (id = null) => {
        editingUsuarioId = id;
        if (id) {
            const user = usuarios.find(u => u.id === id);
            if (user) {
                document.getElementById('modalUsuarioTitle').textContent = 'Editar Usuário';
                inputUsuarioNome.value = user.nome;
                inputUsuarioEmail.value = user.email;
                if (inputUsuarioSenha) inputUsuarioSenha.value = '********'; // Simulação
                inputUsuarioNivel.value = user.nivel;
            }
        } else {
            document.getElementById('modalUsuarioTitle').textContent = 'Adicionar Usuário';
            formUsuario.reset();
        }
        modalUsuario.classList.add('active');
    };

    const closeUsuarioModal = () => {
        modalUsuario.classList.remove('active');
        editingUsuarioId = null;
    };

    document.getElementById('btnCloseModalUsuario').addEventListener('click', closeUsuarioModal);
    document.getElementById('btnCancelModalUsuario').addEventListener('click', closeUsuarioModal);

    // Bind to the new Novo Usuário button
    const btnNovoUsuario = document.getElementById('btnNovoUsuario');
    if (btnNovoUsuario) {
        btnNovoUsuario.addEventListener('click', () => {
            openUsuarioModal();
        });
    }

    formUsuario.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btnSubmit = formUsuario.querySelector('.btn-submit');
        const originalText = btnSubmit.textContent;
        btnSubmit.textContent = "Aguarde...";
        btnSubmit.disabled = true;

        const userData = {
            nome: inputUsuarioNome.value,
            email: inputUsuarioEmail.value,
            nivel: inputUsuarioNivel.value
        };

        try {
            if (editingUsuarioId) {
                await supabaseClient.from("usuarios").update(userData).eq("id", String(editingUsuarioId));
                registrarLog('Editou Usuário', `O usuário ${userData.nome} (${userData.email}) foi editado.`);
                showToast("Usuário editado com sucesso!", "success");
            } else {
                await supabaseClient.from("usuarios").insert([userData]);
                registrarLog('Criou Usuário', `O usuário ${userData.nome} (${userData.email}) com nível ${userData.nivel} foi criado.`);
                showToast("Usuário criado com sucesso!", "success");
            }
            closeUsuarioModal();
        } catch (error) {
            console.error("Erro ao salvar usuário:", error);
            showToast(`Erro ao salvar usuário. Tente novamente.. Detalhe: ${(typeof error !== "undefined" && error) ? error.message : "Desconhecido"}`, 'info');
        }

        btnSubmit.textContent = originalText;
        btnSubmit.disabled = false;
    });

    window.openDeleteUsuarioModal = (id) => {
        deleteType = 'usuario';
        actionId = id;
        document.getElementById('modalDeleteTitle').textContent = 'Excluir usuário';
        document.getElementById('modalDeleteText').textContent = 'Você tem certeza que quer remover o acesso deste usuário?';
        modalExcluir.classList.add('active');
    };

    const renderUsuarios = () => {
        const tbody = document.getElementById('acessosTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (usuarios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="padding: 30px;">Nenhum usuário cadastrado.</td></tr>';
            renderPagination('paginationAcessosContainer', 'acessos', 0, 10, renderUsuarios);
            return;
        }

        const limit = 10;
        const totalPages = Math.ceil(usuarios.length / limit) || 1;
        if (paginationState.acessos > totalPages) paginationState.acessos = totalPages;
        const start = (paginationState.acessos - 1) * limit;
        const pagedUsuarios = usuarios.slice(start, start + limit);

        pagedUsuarios.forEach(user => {
            const tr = document.createElement('tr');

            let badgeClass = 'badge-viewer';
            if (user.nivel === 'Master') badgeClass = 'badge-master';
            if (user.nivel === 'Administrador') badgeClass = 'badge-admin';
            if (user.nivel === 'Editor') badgeClass = 'badge-editor';

            tr.innerHTML = `
                <td><strong>${user.nome}</strong></td>
                <td>${user.email}</td>
                <td><span class="badge ${badgeClass}">${user.nivel}</span></td>
                <td>
                    <button class="action-btn edit" onclick="window.openEditUsuario('${user.id}')" title="Editar"><i class="ph ph-pencil-simple"></i></button>
                    <button class="action-btn delete" onclick="window.openDeleteUsuarioModal('${user.id}')" title="Excluir"><i class="ph ph-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        renderPagination('paginationAcessosContainer', 'acessos', usuarios.length, limit, renderUsuarios);
    };

    window.openEditUsuario = (id) => {
        openUsuarioModal(id);
    };

    // ==========================================
    // Funções de Log de Ações
    // ==========================================

    // --- LÓGICA DA PÁGINA DE GUIAS ---
    // Listener de guias (Supabase)
    const fetchGuias = async () => {
        const { data } = await supabaseClient.from('guias').select('*');
        if (data) {
            guias = data;
            if (currentPage === 'ajuda') renderGuias();
        }
    };
    fetchGuias();
    supabaseClient.channel('guias_channel').on('postgres_changes', { event: '*', schema: 'public', table: 'guias' }, fetchGuias).subscribe();

    // Ensure configuracoes has guiaTipos
    if (!configuracoes.guiaTipos) configuracoes.guiaTipos = [];

    const modalNovaGuia = document.getElementById('modalNovaGuia');
    const btnNovoGuia = document.getElementById('btnNovoGuia');
    const formNovaGuia = document.getElementById('formNovaGuia');
    const btnCloseGuia = document.getElementById('btnCloseGuia');
    const btnCancelGuia = document.getElementById('btnCancelGuia');

    const btnToggleCaminho = document.getElementById('btnToggleCaminho');
    const btnToggleTipo = document.getElementById('btnToggleTipo');
    const inputGuiaTipoForm = document.getElementById('inputGuiaTipoForm');

    const sectionCaminho = document.getElementById('formSectionCaminho');
    const inputGuiaTipoSelect = document.getElementById('inputGuiaTipoSelect');

    const openGuiaModal = (editId = null) => {
        currentEditGuiaId = editId;

        // Popula select de tipos
        inputGuiaTipoSelect.innerHTML = '<option value="">Selecione o Tipo</option>';
        if (configuracoes.guiaTipos) {
            configuracoes.guiaTipos.forEach(t => {
                inputGuiaTipoSelect.innerHTML += `<option value="${t}">${t}</option>`;
            });
        }

        if (editId) {
            const g = guias.find(x => x.id === editId);
            document.getElementById('inputGuiaTitulo').value = g.titulo;
            inputGuiaTipoSelect.value = g.tipo;
            document.getElementById('inputGuiaConteudo').value = g.conteudo;
            document.getElementById('inputGuiaAnexo').value = g.anexo || '';

            document.querySelector('#modalNovaGuiaTitle').textContent = "Editar guia";
            document.querySelector('#formNovaGuia .btn-submit').textContent = "Salvar";
        } else {
            formNovaGuia.reset();
            document.querySelector('#modalNovaGuiaTitle').textContent = "Criar nova guia";
            document.querySelector('#formNovaGuia .btn-submit').textContent = "Criar";
        }

        modalNovaGuia.classList.add('active');
    };

    if (btnNovoGuia) btnNovoGuia.addEventListener('click', () => openGuiaModal(null));
    if (btnCloseGuia) btnCloseGuia.addEventListener('click', () => modalNovaGuia.classList.remove('active'));
    if (btnCancelGuia) btnCancelGuia.addEventListener('click', () => modalNovaGuia.classList.remove('active'));

    if (formNovaGuia) {
        formNovaGuia.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btnSubmit = formNovaGuia.querySelector('.btn-submit');
            btnSubmit.disabled = true;

            try {
                // Creating/Editing Caminho
                const dataObj = {
                    titulo: document.getElementById('inputGuiaTitulo').value.trim(),
                    tipo: inputGuiaTipoSelect.value,
                    conteudo: document.getElementById('inputGuiaConteudo').value.trim(),
                    anexo: document.getElementById('inputGuiaAnexo').value.trim(),
                    dataAtualizacao: Date.now()
                };

                if (currentEditGuiaId) {
                    await supabaseClient.from("guias").update(dataObj).eq("id", currentEditGuiaId);
                    showToast("Guia atualizada com sucesso!", "success");
                    registrarLog('Editou Guia', `Guia: ${dataObj.titulo}`);
                } else {
                    const currentUser = usuarios.find(u => u.email === loggedUser.email);
                    dataObj.autor = currentUser ? currentUser.nome : loggedUser.email;
                    dataObj.dataCriacao = Date.now();
                    await supabaseClient.from("guias").insert([dataObj]);
                    showToast("Guia criada com sucesso!", "success");
                    registrarLog('Criou Guia', `Guia: ${dataObj.titulo}`);
                }

                modalNovaGuia.classList.remove('active');
                renderGuias();
            } catch (err) {
                console.error("Erro ao salvar guia:", err);
                showToast(`Erro ao salvar guia.. Detalhe: ${(typeof error !== "undefined" && error) ? error.message : "Desconhecido"}`, "error");
            } finally {
                btnSubmit.disabled = false;
            }
        });
    }

    // Filter Logic for Guias
    const filterGuiaTipo = document.getElementById('filterGuiaTipo');
    const inputBuscarGuia = document.getElementById('inputBuscarGuia');
    const btnResetGuia = document.getElementById('btnResetGuia');

    const updateGuiaFilterOptions = () => {
        if (!filterGuiaTipo) return;
        const currentVal = filterGuiaTipo.value;
        filterGuiaTipo.innerHTML = '<option value="">Tipo (Todos)</option>';
        if (configuracoes.guiaTipos) {
            configuracoes.guiaTipos.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t; opt.textContent = t;
                if (t === currentVal) opt.selected = true;
                filterGuiaTipo.appendChild(opt);
            });
        }
    };

    if (inputBuscarGuia) inputBuscarGuia.addEventListener('input', () => renderGuias());
    if (filterGuiaTipo) filterGuiaTipo.addEventListener('change', () => renderGuias());
    if (btnResetGuia) {
        btnResetGuia.addEventListener('click', () => {
            inputBuscarGuia.value = '';
            filterGuiaTipo.value = '';
            renderGuias();
        });
    }

    const modalViewGuia = document.getElementById('modalViewGuia');
    const btnCloseViewGuia = document.getElementById('btnCloseViewGuia');
    if (btnCloseViewGuia) btnCloseViewGuia.addEventListener('click', () => modalViewGuia.classList.remove('active'));

    window.visualizarGuia = (id) => {
        const g = guias.find(x => x.id === id);
        if (!g) return;

        document.getElementById('viewGuiaTitulo').textContent = g.titulo || g.tipo || 'Sem Título';

        const conteudoEl = document.getElementById('viewGuiaConteudo');
        if (g.conteudo) {
            conteudoEl.textContent = g.conteudo;
        } else {
            conteudoEl.innerHTML = '<span style="color: var(--text-muted); font-style: italic;">Sem descrição disponível.</span>';
        }

        const anexoEl = document.getElementById('viewGuiaAnexo');
        if (g.anexo) {
            if (g.anexo.startsWith('http://') || g.anexo.startsWith('https://')) {
                anexoEl.innerHTML = `<a href="${g.anexo}" target="_blank" style="color: var(--active-purple); text-decoration: underline;">${g.anexo}</a>`;
            } else {
                anexoEl.textContent = g.anexo;
            }
        } else {
            anexoEl.innerHTML = '<span style="color: var(--text-muted); font-style: italic;">Nenhum anexo.</span>';
        }
        const btnCopy = document.getElementById('btnCopyViewGuia');
        if (btnCopy) {
            const newBtnCopy = btnCopy.cloneNode(true);
            btnCopy.parentNode.replaceChild(newBtnCopy, btnCopy);

            newBtnCopy.addEventListener('click', () => {
                let texto = '';
                if (g.conteudo) texto += `${g.conteudo}\n`;
                if (g.anexo) texto += `\n*Anexos:*\n${g.anexo}`;
                texto = texto.trim();

                navigator.clipboard.writeText(texto).then(() => {
                    showToast('Conteúdo copiado para a área de transferência!', 'success');
                    newBtnCopy.innerHTML = '<i class="ph ph-check"></i> Copiado';
                    setTimeout(() => {
                        newBtnCopy.innerHTML = '<i class="ph ph-copy"></i> Copiar';
                    }, 2000);
                }).catch(err => {
                    console.error('Erro ao copiar', err);
                    showToast('Erro ao copiar texto', 'error');
                });
            });
        }

        modalViewGuia.classList.add('active');
    };

    window.openDeleteGuiaModal = (id) => {
        deleteType = 'guia';
        actionId = id;
        document.getElementById('modalDeleteTitle').textContent = 'Excluir guia';
        document.getElementById('modalDeleteText').textContent = 'Você tem certeza que quer deletar esta guia?';
        modalExcluir.classList.add('active');
    };

    window.deletarGuia = (id) => {
        openDeleteGuiaModal(id);
    };

    window.editGuia = (id) => {
        openGuiaModal(id);
    };

    const renderGuias = () => {
        const tbody = document.getElementById('guiaTableBody');
        if (!tbody) return;

        const searchQueryGuia = (document.getElementById('inputBuscarGuia')?.value || '').toLowerCase();
        const tipoQueryGuia = document.getElementById('filterGuiaTipo')?.value || '';

        let filtered = guias;

        if (tipoQueryGuia) {
            filtered = filtered.filter(g => g.tipo === tipoQueryGuia);
        }

        if (searchQueryGuia) {
            filtered = filtered.filter(g =>
                (g.titulo && g.titulo.toLowerCase().includes(searchQueryGuia)) ||
                (g.conteudo && g.conteudo.toLowerCase().includes(searchQueryGuia)) ||
                (g.tipo && g.tipo.toLowerCase().includes(searchQueryGuia))
            );
        }

        // Sort newest first by default
        filtered.sort((a, b) => (b.dataAtualizacao || 0) - (a.dataAtualizacao || 0));

        tbody.innerHTML = '';
        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Nenhuma guia encontrada.</td></tr>`;
            renderPagination('paginationGuiaContainer', 'guias', 0, 15, renderGuias);
            return;
        }

        const limit = 15;
        const totalPages = Math.ceil(filtered.length / limit) || 1;
        if (paginationState.guias > totalPages) paginationState.guias = totalPages;
        const start = (paginationState.guias - 1) * limit;
        const pagedGuias = filtered.slice(start, start + limit);

        pagedGuias.forEach(g => {
            const tr = document.createElement('tr');

            const tdDesc = document.createElement('td');
            tdDesc.textContent = g.titulo || '-';

            const tdTipo = document.createElement('td');
            tdTipo.innerHTML = `<span class="status-badge" style="background-color: rgba(255,255,255,0.1);">${g.tipo || '-'}</span>`;

            const tdAutor = document.createElement('td');
            tdAutor.textContent = g.autor || '-';

            const dataC = g.dataCriacao ? new Date(g.dataCriacao).toLocaleDateString('pt-BR') : '-';
            const tdCriacao = document.createElement('td');
            tdCriacao.textContent = dataC;

            const dataA = g.dataAtualizacao ? new Date(g.dataAtualizacao).toLocaleDateString('pt-BR') : '-';
            const tdAtt = document.createElement('td');
            tdAtt.textContent = dataA;

            const tdActions = document.createElement('td');
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'actions';

            actionsDiv.innerHTML = `
                <button class="action-btn view" onclick="visualizarGuia('${g.id}')" title="Visualizar"><i class="ph ph-eye"></i></button>
            `;

            if (userAccessLevel !== 'Visualizador') {
                actionsDiv.innerHTML += `
                    <button class="action-btn edit" onclick="editGuia('${g.id}')" title="Editar"><i class="ph ph-pencil-simple"></i></button>
                    <button class="action-btn delete" onclick="deletarGuia('${g.id}')" title="Excluir"><i class="ph ph-trash"></i></button>
                `;
            }

            tdActions.appendChild(actionsDiv);

            tr.appendChild(tdDesc);
            tr.appendChild(tdTipo);
            tr.appendChild(tdAutor);
            tr.appendChild(tdCriacao);
            tr.appendChild(tdAtt);
            tr.appendChild(tdActions);

            tbody.appendChild(tr);
        });
        renderPagination('paginationGuiaContainer', 'guias', filtered.length, limit, renderGuias);
    };



    let selectedLogsIds = [];
    let searchLogsQuery = '';
    let selectedLogsDateInicio = null;
    let selectedLogsDateFim = null;

    window.updateLogsBulkVisibility = () => {
        const bulkContainer = document.getElementById('bulkActionsLogs');
        const countSpan = document.getElementById('bulkSelectedCountLogs');
        if (!bulkContainer) return;

        if (selectedLogsIds.length > 0) {
            bulkContainer.style.display = 'flex';
            countSpan.textContent = selectedLogsIds.length;
        } else {
            bulkContainer.style.display = 'none';
        }
    };

    window.deleteLog = async (logId, event) => {
        event.stopPropagation();
        currentLogDeleteAction = 'single';
        currentLogDeleteId = logId;
        const modal = document.getElementById('modalExcluirLog');
        const text = document.getElementById('modalDeleteLogText');
        if (text) text.textContent = 'Você tem certeza que quer deletar este registro?';
        if (modal) modal.classList.add('active');
    };

    const renderLogs = () => {
        const tbody = document.getElementById('logTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        let filtered = logsAcoes;

        if (searchLogsQuery) {
            const q = searchLogsQuery.toLowerCase();
            filtered = filtered.filter(l =>
                (l.usuario && l.usuario.toLowerCase().includes(q)) ||
                (l.acao && l.acao.toLowerCase().includes(q)) ||
                (l.detalhes && l.detalhes.toLowerCase().includes(q))
            );
        }

        if (selectedLogsDateInicio && selectedLogsDateFim) {
            filtered = filtered.filter(l => {
                if (!l.timestamp) return true;
                const d = new Date(l.timestamp);
                d.setHours(0, 0, 0, 0);
                return d >= selectedLogsDateInicio && d <= selectedLogsDateFim;
            });
        }

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding: 30px;">Nenhum registro encontrado.</td></tr>';
            updateLogsBulkVisibility();
            updateLogsSelectAllCheckbox(filtered);
            renderPagination('paginationLogsContainer', 'logs', 0, 100, renderLogs);
            return;
        }

        const limit = 100;
        const totalPages = Math.ceil(filtered.length / limit) || 1;
        if (paginationState.logs > totalPages) paginationState.logs = totalPages;
        const start = (paginationState.logs - 1) * limit;
        const pagedFiltered = filtered.slice(start, start + limit);

        pagedFiltered.forEach(log => {
            const tr = document.createElement('tr');
            const isChecked = selectedLogsIds.includes(log.id) ? 'checked' : '';
            tr.className = isChecked ? 'selected-row' : '';

            tr.addEventListener('click', (e) => {
                if (e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'button' || e.target.closest('button')) return;
                const cb = tr.querySelector('.log-checkbox');
                cb.checked = !cb.checked;
                cb.dispatchEvent(new Event('change'));
            });

            tr.innerHTML = `
                <td onclick="event.stopPropagation()">
                    <input type="checkbox" class="log-checkbox" value="${log.id}" ${isChecked}>
                </td>
                <td><strong>${log.usuario}</strong></td>
                <td><span class="pill pill-black">${log.acao}</span></td>
                <td>${log.detalhes}</td>
                <td style="white-space: nowrap;"><i class="ph ph-clock"></i> ${log.dataHora}</td>
            `;

            const cb = tr.querySelector('.log-checkbox');
            cb.addEventListener('change', (e) => {
                if (e.target.checked) {
                    if (!selectedLogsIds.includes(log.id)) selectedLogsIds.push(log.id);
                    tr.classList.add('selected-row');
                } else {
                    selectedLogsIds = selectedLogsIds.filter(id => id !== log.id);
                    tr.classList.remove('selected-row');
                }
                updateLogsBulkVisibility();
                updateLogsSelectAllCheckbox(pagedFiltered);
            });

            tbody.appendChild(tr);
        });
        updateLogsSelectAllCheckbox(pagedFiltered);
        renderPagination('paginationLogsContainer', 'logs', filtered.length, limit, renderLogs);
    };

    function updateLogsSelectAllCheckbox(filtered) {
        const selectAllCb = document.getElementById('selectAllLogs');
        if (!selectAllCb) return;
        const currentIds = filtered.map(l => l.id);
        const selectedCurrent = currentIds.filter(id => selectedLogsIds.includes(id));

        if (currentIds.length === 0) {
            selectAllCb.checked = false;
            selectAllCb.indeterminate = false;
        } else if (selectedCurrent.length === currentIds.length) {
            selectAllCb.checked = true;
            selectAllCb.indeterminate = false;
        } else if (selectedCurrent.length > 0) {
            selectAllCb.checked = false;
            selectAllCb.indeterminate = true;
        } else {
            selectAllCb.checked = false;
            selectAllCb.indeterminate = false;
        }
    }


    const btnClearLogs = document.getElementById('btnClearLogs');
    if (btnClearLogs) {
        btnClearLogs.addEventListener('click', async () => {
            currentLogDeleteAction = 'clear';
            const modal = document.getElementById('modalExcluirLog');
            const text = document.getElementById('modalDeleteLogText');
            if (text) text.textContent = 'Tem certeza que deseja limpar todo o histórico de movimentações? Esta ação não pode ser desfeita.';
            if (modal) modal.classList.add('active');
        });
    }


    renderLogs();

    if (userAccessLevel === 'Editor') {
        const navLog = document.getElementById('navLog');
        if (navLog) navLog.style.display = 'none';
    }

    // ==========================================
    // Modal Excluir Log Event Listeners
    // ==========================================
    const modalExcluirLog = document.getElementById('modalExcluirLog');
    const btnCancelDeleteLog = document.getElementById('btnCancelDeleteLog');
    const btnConfirmDeleteLog = document.getElementById('btnConfirmDeleteLog');

    if (btnCancelDeleteLog) {
        btnCancelDeleteLog.addEventListener('click', () => {
            if (modalExcluirLog) modalExcluirLog.classList.remove('active');
            currentLogDeleteAction = null;
            currentLogDeleteId = null;
        });
    }

    if (btnConfirmDeleteLog) {
        btnConfirmDeleteLog.addEventListener('click', async () => {
            if (!currentLogDeleteAction) return;

            if (currentLogDeleteAction === 'single' && currentLogDeleteId) {
                try {
                    const { error } = await supabaseClient.from('logs').delete().eq('id', currentLogDeleteId);
                    if (error) throw error;
                    showToast('Registro excluído', 'success');
                    if (modalExcluirLog) modalExcluirLog.classList.remove('active');
                } catch (e) {
                    showToast('Erro ao excluir registro', 'error');
                }
            } else if (currentLogDeleteAction === 'bulk' && selectedLogsIds.length > 0) {
                try {
                    const { error } = await supabaseClient.from('logs').delete().in('id', selectedLogsIds);
                    if (error) throw error;
                    showToast(`${selectedLogsIds.length} registros excluídos`, 'success');
                    selectedLogsIds = [];
                    if (modalExcluirLog) modalExcluirLog.classList.remove('active');
                    updateLogsBulkVisibility();
                    // Need to trigger a custom event or let realtime handle it
                } catch (e) {
                    showToast('Erro ao excluir registros', 'error');
                }
            } else if (currentLogDeleteAction === 'clear') {
                try {
                    const { error: _err9 } = await supabaseClient.from("logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                    if (_err9) throw _err9;
                    showToast("Histórico limpo com sucesso!", "success");
                    selectedLogsIds = [];
                    if (modalExcluirLog) modalExcluirLog.classList.remove('active');
                } catch (err) {
                    showToast('Erro ao limpar histórico', 'error');
                }
            }

            currentLogDeleteAction = null;
            currentLogDeleteId = null;
        });
    }

    // ==========================================
    // Theme Toggle
    // ==========================================
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeIcon = document.getElementById('themeIcon');
    const themeText = document.getElementById('themeText');

    const updateThemeUI = () => {
        const isLight = document.documentElement.classList.contains('light-mode');
        if (themeIcon && themeText) {
            themeIcon.className = isLight ? 'ph ph-sun' : 'ph ph-moon';
            themeText.textContent = isLight ? 'Modo Claro' : 'Modo Escuro';
        }
    };

    // Initial check (if theme was loaded at top)
    updateThemeUI();

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            document.documentElement.classList.toggle('light-mode');
            const isLight = document.documentElement.classList.contains('light-mode');
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
            updateThemeUI();
        });
    }

    // ==========================================
    // Render inicial
    // ==========================================
    updateFilterOptions();
    renderTables();
    renderSelectOptions();
    if (typeof window.renderControleTable === 'function') window.renderControleTable();
    renderUsuarios();
    renderLogs();
});

// Initialize Custom Color Pickers
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.custom-color-picker').forEach(picker => {
        const targetId = picker.getAttribute('data-target');
        const hiddenInput = document.getElementById(targetId);
        const swatches = picker.querySelectorAll('.color-swatch:not(.custom-swatch)');
        const customSwatchInput = picker.querySelector('.hidden-color-input');

        swatches.forEach(swatch => {
            swatch.addEventListener('click', () => {
                picker.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');
                hiddenInput.value = swatch.getAttribute('data-color');
            });
        });

        if (customSwatchInput) {
            customSwatchInput.addEventListener('input', (e) => {
                picker.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                customSwatchInput.parentElement.classList.add('active');
                hiddenInput.value = e.target.value;
            });
        }
    });
});

// Initialize Pickr
document.addEventListener('DOMContentLoaded', () => {
    const pickrConfig = {
        theme: 'nano',
        swatches: [
            '#ef4444', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#4C1D95'
        ],
        components: {
            preview: true,
            opacity: false,
            hue: true,
            interaction: {
                hex: true,
                input: true,
                save: true
            }
        },
        i18n: {
            'btn:save': 'Salvar'
        }
    };

    if (document.getElementById('pickrNovoResponsavel')) {
        const pickrResp = Pickr.create({
            el: '#pickrNovoResponsavel',
            default: '#8b5cf6',
            ...pickrConfig
        });
        pickrResp.on('save', (color) => {
            document.getElementById('colorNovoResponsavel').value = color.toHEXA().toString();
            pickrResp.hide();
        });
    }

    if (document.getElementById('pickrNovoMeio')) {
        const pickrMeio = Pickr.create({
            el: '#pickrNovoMeio',
            default: '#4C1D95',
            ...pickrConfig
        });
        pickrMeio.on('save', (color) => {
            document.getElementById('colorNovoMeio').value = color.toHEXA().toString();
            pickrMeio.hide();
        });
    }

    if (document.getElementById('pickrEditarOpcao')) {
        window.pickrEditarOpcao = Pickr.create({
            el: '#pickrEditarOpcao',
            default: '#8b5cf6',
            ...pickrConfig
        });
        window.pickrEditarOpcao.on('save', (color) => {
            document.getElementById('colorEditarOpcao').value = color.toHEXA().toString();
            window.pickrEditarOpcao.hide();
        });
    }
});

// We need to update pickrEditarOpcao when editing an option
// In window.openEditControleModal, we will set the pickr color
const oldOpenEdit = window.openEditControleModal;
window.openEditControleModal = (type, index) => {
    // This hook allows us to intercept the call and update the pickr UI
    // But since oldOpenEdit is redefined, we must just let it run and then update Pickr.
    // Wait, the original function is defined as window.openEditControleModal = (type, index) => { ... }
    // We can't easily hook it if it's already running. Let's just patch the original function.
};


// Modal Gerenciar Tipos Guia
document.addEventListener('DOMContentLoaded', () => {
    const btnGerenciarTiposGuia = document.getElementById('btnGerenciarTiposGuia');
    const modalGerenciarTipos = document.getElementById('modalGerenciarTipos');
    const closeModalGerenciarTipos = document.getElementById('closeModalGerenciarTipos');

    if (btnGerenciarTiposGuia && modalGerenciarTipos) {
        btnGerenciarTiposGuia.addEventListener('click', () => {
            modalGerenciarTipos.classList.add('active');
        });

        closeModalGerenciarTipos.addEventListener('click', () => {
            modalGerenciarTipos.classList.remove('active');
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
            renderPagination('paginationTiposGuiaContainer', 'tiposGuia', 0, 15, renderTiposGuiaTable);
            return;
        }

        const limit = 15;
        const totalPages = Math.ceil(configuracoes.guiaTipos.length / limit) || 1;
        if (paginationState.tiposGuia > totalPages) paginationState.tiposGuia = totalPages;
        const start = (paginationState.tiposGuia - 1) * limit;
        const pagedTiposGuia = configuracoes.guiaTipos.slice(start, start + limit);

        pagedTiposGuia.forEach((tipo, index) => {
            const tr = document.createElement('tr');
            // The actionIndex needs to be the absolute index in the original array
            const actionIndex = start + index;
            tr.innerHTML = `
                <td><strong>${tipo}</strong></td>
                <td style="display: flex; gap: 8px;">
                    <button class="icon-btn btn-primary" onclick="window.editarTipoGuia(${actionIndex})" title="Editar" style="padding: 4px;"><i class="ph ph-pencil-simple"></i></button>
                    <button class="icon-btn btn-delete" onclick="window.deletarTipoGuia(${actionIndex})" title="Excluir" style="padding: 4px;"><i class="ph ph-trash"></i></button>
                </td>
            `;
            tiposGuiaTableBody.appendChild(tr);
        });
        renderPagination('paginationTiposGuiaContainer', 'tiposGuia', configuracoes.guiaTipos.length, limit, renderTiposGuiaTable);
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
