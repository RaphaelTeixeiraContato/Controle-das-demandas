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
    if(type === 'error') icon = 'ph-x-circle';
    else if(type === 'warning') icon = 'ph-warning-circle';
    else if(type === 'info') icon = 'ph-info';
    
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
    const pageTitle = document.getElementById('pageTitle');
    
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
    let currentPage = 'abertas'; // 'abertas' | 'historico'
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
            
                        let usuariosSyncInit = false;
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
            } else {
                configuracoes = { responsaveis: [], assessores: [], meios: [], guiaTipos: [] };
                await supabaseClient.from('configuracoes').upsert([{ id: 'geral', dados: configuracoes }]);
            }
            renderControleLists();
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

            if (page === 'abertas') {
                viewAbertas.style.display = 'block';
                viewHistorico.style.display = 'none';
                document.getElementById('viewControle').style.display = 'none';
                document.getElementById('viewAcessos').style.display = 'none';
                document.getElementById('viewLog').style.display = 'none';
                document.getElementById('viewAjuda').style.display = 'none';
                headerActionsDemandas.style.display = 'flex';
                headerActionsAcessos.style.display = 'none';
                pageTitle.textContent = 'Demandas em aberto';
                countBadge.style.display = 'inline-block';
                btnNova.style.display = 'flex';
            } else if (page === 'historico') {
                viewAbertas.style.display = 'none';
                viewHistorico.style.display = 'block';
                document.getElementById('viewControle').style.display = 'none';
                document.getElementById('viewAcessos').style.display = 'none';
                document.getElementById('viewLog').style.display = 'none';
                document.getElementById('viewAjuda').style.display = 'none';
                headerActionsDemandas.style.display = 'flex';
                headerActionsAcessos.style.display = 'none';
                pageTitle.textContent = 'Histórico de demandas';
                countBadge.style.display = 'inline-block';
                btnNova.style.display = 'none'; // Não adiciona no histórico diretamente
            } else if (page === 'controle') {
                viewAbertas.style.display = 'none';
                viewHistorico.style.display = 'none';
                document.getElementById('viewControle').style.display = 'block';
                document.getElementById('viewAcessos').style.display = 'none';
                document.getElementById('viewLog').style.display = 'none';
                document.getElementById('viewAjuda').style.display = 'none';
                headerActionsDemandas.style.display = 'none';
                headerActionsAcessos.style.display = 'none';
                pageTitle.textContent = '';
                countBadge.style.display = 'none';
                btnNova.style.display = 'none';
            } else if (page === 'acessos') {
                viewAbertas.style.display = 'none';
                viewHistorico.style.display = 'none';
                document.getElementById('viewControle').style.display = 'none';
                document.getElementById('viewAcessos').style.display = 'block';
                document.getElementById('viewLog').style.display = 'none';
                document.getElementById('viewAjuda').style.display = 'none';
                headerActionsDemandas.style.display = 'none';
                headerActionsAcessos.style.display = 'flex';
                pageTitle.textContent = 'Gerenciar Acessos';
                countBadge.style.display = 'none';
            } else if (page === 'log') {
                viewAbertas.style.display = 'none';
                viewHistorico.style.display = 'none';
                document.getElementById('viewControle').style.display = 'none';
                document.getElementById('viewAcessos').style.display = 'none';
                document.getElementById('viewLog').style.display = 'block';
                document.getElementById('viewAjuda').style.display = 'none';
                headerActionsDemandas.style.display = 'none';
                headerActionsAcessos.style.display = 'none';
                pageTitle.textContent = 'Histórico de Movimentações';
                countBadge.style.display = 'none';
            } else if (page === 'ajuda') {
                viewAbertas.style.display = 'none';
                viewHistorico.style.display = 'none';
                document.getElementById('viewControle').style.display = 'none';
                document.getElementById('viewAcessos').style.display = 'none';
                document.getElementById('viewLog').style.display = 'none';
                document.getElementById('viewAjuda').style.display = 'block';
                headerActionsDemandas.style.display = 'none';
                headerActionsAcessos.style.display = 'none';
                pageTitle.textContent = 'Guia';
                countBadge.style.display = 'none';
                btnNova.style.display = 'none';
                renderGuias();
            }

            // Reset filters and selection on page change
            searchQuery = '';
            inputBuscar.value = '';
            selectedResponsavel = '';
            selectedMeio = '';
            selectedDateInicio = null;
            selectedDateFim = null;
            selectedIds = [];
            updateBulkActionsVisibility();
            document.querySelectorAll('.select-all-checkbox').forEach(cb => {
                cb.checked = false;
                cb.indeterminate = false;
            });
            if (window.datePickerInstance) {
                window.datePickerInstance.clear();
                document.getElementById('dateFilterValue').textContent = 'Período...';
            }
            sortConfig = { column: 'data', direction: 'desc' };

            updateFilterOptions();
            renderTables();
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
                if (currentPage === 'abertas' && inputDataEncerramento.value) {
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
                    }
                }
                closeTransferModal();
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
        if(!dateString) return '-';
        const parts = dateString.split('-');
        if(parts.length !== 3) return dateString;
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
                if((r.nome || r) === currResp) opt.selected = true;
                filterResponsavel.appendChild(opt);
            });
        }

        filterMeio.innerHTML = '<option value="">Meio (Todos)</option>';
        if (configuracoes.meios) {
            configuracoes.meios.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.nome || m; opt.textContent = m.nome || m;
                if((m.nome || m) === currMeio) opt.selected = true;
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
        const dataToRender = currentPage === 'abertas' ? applyFiltersAndSort([...demandas]) : applyFiltersAndSort([...historico]);
        
        if (currentPage === 'abertas') {
            tableBody.innerHTML = '';
            
            dataToRender.forEach((d) => {
                const tr = document.createElement('tr');
                if (selectedIds.includes(d.id)) {
                    tr.classList.add('selected-row');
                }
                const respObj = configuracoes.responsaveis.find(r => r.nome === d.responsavel);
                const meioObj = configuracoes.meios.find(m => m.nome === d.meio);
                
                const respStyle = respObj && respObj.cor ? `style="background-color: ${respObj.cor}; color: #fff; border: none;"` : 'class="pill pill-red"';
                const meioStyle = meioObj && meioObj.cor ? `style="background-color: ${meioObj.cor}; color: #fff; border: none;"` : 'class="pill pill-blue"';
                let quemClass = 'pill-black';

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
                    <td><span class="pill ${quemClass}">${d.comQuem}</span></td>
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
            countBadge.textContent = `(${dataToRender.length})`;

        } else if (currentPage === 'historico') {
            historicoTableBody.innerHTML = '';
            
            dataToRender.forEach((d) => {
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
            countBadge.textContent = `(${dataToRender.length})`;
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
        updateSelectAllCheckboxState(dataToRender);
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
            const sourceData = currentPage === 'abertas' ? applyFiltersAndSort([...demandas]) : applyFiltersAndSort([...historico]);
            
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
        
        if (!dataEncerramento) {
            showToast('Por favor, preencha a data de encerramento.', 'info');
            return;
        }

        if (currentPage === 'abertas' && !motivoEncerramento) {
            showToast('Por favor, preencha o motivo do encerramento.', 'info');
            return;
        }

        btn.textContent = 'Aguarde...';
        btn.disabled = true;

        try {
            if (currentPage === 'abertas') {
                const historicoItems = [];
                const idsToDelete = [];
                selectedIds.forEach(id => {
                    const demanda = demandas.find(d => d.id === id);
                    if (demanda) {
                        historicoItems.push({
                            responsavel: demanda.responsavel,
                            assessor: demanda.assessor,
                            cliente: demanda.cliente,
                            demanda: demanda.demanda,
                            meio: demanda.meio,
                            protocolo: demanda.protocolo,
                            comentarios: demanda.comentarios,
                            comQuem: demanda.comQuem,
                            data: demanda.data,
                            dataEncerramento: dataEncerramento,
                            motivoEncerramento: motivoEncerramento,
                            timestampEncerramento: Date.now(),
                            originalId: id
                        });
                        idsToDelete.push(id);
                    }
                });
                if (historicoItems.length > 0) {
                    await supabaseClient.from("historico").insert(historicoItems);
                    
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
                        demandaItems.push({
                            responsavel: historicoItem.responsavel,
                            assessor: historicoItem.assessor,
                            cliente: historicoItem.cliente,
                            demanda: historicoItem.demanda,
                            meio: historicoItem.meio,
                            protocolo: historicoItem.protocolo,
                            comentarios: historicoItem.comentarios,
                            comQuem: historicoItem.comQuem,
                            data: historicoItem.data,
                            timestamp: Date.now()
                        });
                        idsToDelete.push(id);
                    }
                });
                if (demandaItems.length > 0) {
                    await supabaseClient.from("demandas").insert(demandaItems);
                    
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
            document.getElementById('inputResponsavel').value = demanda.responsavel;
            document.getElementById('inputAssessor').value = demanda.assessor;
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
    const filterDateRange = document.getElementById('filterDateRange');

    if (btnDateFilter && filterDateRange) {
        window.datePickerInstance = flatpickr(filterDateRange, {
            mode: "range",
            dateFormat: "Y-m-d",
            locale: "pt",
            positionElement: btnDateFilter,
            onChange: function(selectedDates, dateStr, instance) {
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
            } else {
                await supabaseClient.from("demandas").insert([dadosFormulario]);
                registrarLog('Criou Demanda', `Nova demanda "${dadosFormulario.demanda}" criada para o cliente ${dadosFormulario.cliente}.`);
            }
            closeModal();
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
    const renderSelectOptions = () => {
        const selResp = document.getElementById('inputResponsavel');
        const selAssessor = document.getElementById('inputAssessor');
        const selMeio = document.getElementById('inputMeio');

        if(selResp) {
            const val = selResp.value;
            selResp.innerHTML = '<option value="">Selecione</option>';
            configuracoes.responsaveis.forEach(o => selResp.innerHTML += `<option value="${o.nome}">${o.nome}</option>`);
            selResp.value = val;
        }
        if(selAssessor) {
            const val = selAssessor.value;
            selAssessor.innerHTML = '<option value="">Selecione</option>';
            configuracoes.assessores.forEach(o => selAssessor.innerHTML += `<option value="${o}">${o}</option>`);
            selAssessor.value = val;
        }
        if(selMeio) {
            const val = selMeio.value;
            selMeio.innerHTML = '<option value="">Selecione</option>';
            configuracoes.meios.forEach(o => selMeio.innerHTML += `<option value="${o.nome}">${o.nome}</option>`);
            selMeio.value = val;
        }
    };

    const renderControleLists = () => {
        const renderList = (id, items, type) => {
            const list = document.getElementById(id);
            if(!list) return;
            list.innerHTML = '';
            items.forEach((item, index) => {
                const li = document.createElement('li');
                const isObj = typeof item === 'object';
                const nome = isObj ? item.nome : item;
                const cor = isObj && item.cor ? `<div style="width: 14px; height: 14px; border-radius: 50%; background-color: ${item.cor}; border: 1px solid rgba(255,255,255,0.2);"></div>` : '';
                
                li.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${cor}
                        <span>${nome}</span>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-delete" style="color: #666;" onclick="window.openEditControleModal('${type}', ${index})" title="Editar"><i class="ph ph-pencil-simple"></i></button>
                        <button class="btn-delete" onclick="window.openDeleteControleModal('${type}', ${index})" title="Remover"><i class="ph ph-trash"></i></button>
                    </div>
                `;
                list.appendChild(li);
            });
        };

        renderList('listResponsavel', configuracoes.responsaveis, 'responsaveis');
        renderList('listAssessor', configuracoes.assessores, 'assessores');
        renderList('listMeio', configuracoes.meios, 'meios');
    };

    window.addControleItem = async (type) => {
        let inputId = '';
        if(type === 'responsaveis') inputId = 'inputNovoResponsavel';
        if(type === 'assessores') inputId = 'inputNovoAssessor';
        if(type === 'meios') inputId = 'inputNovoMeio';

        const input = document.getElementById(inputId);
        if(!input) return;
        const val = input.value.trim();
        
        if(val) {
            let colorVal = null;
            if(type === 'responsaveis') colorVal = document.getElementById('colorNovoResponsavel')?.value || '#8b5cf6';
            if(type === 'meios') colorVal = document.getElementById('colorNovoMeio')?.value || '#4C1D95';

            const exists = type === 'assessores' 
                ? configuracoes[type].includes(val) 
                : configuracoes[type].some(x => x.nome.toLowerCase() === val.toLowerCase());

            if(!exists) {
                if(type === 'assessores') {
                    configuracoes[type].push(val);
                    configuracoes[type].sort();
                } else {
                    configuracoes[type].push({nome: val, cor: colorVal});
                    configuracoes[type].sort((a,b) => a.nome.localeCompare(b.nome));
                }
                
                try {
                    await supabaseClient.from("configuracoes").upsert([{ "id": "geral", "dados": configuracoes }]);
                    registrarLog('Adicionou Opção de Controle', `A opção "${val}" foi adicionada a ${type}.`);
                    input.value = '';
                } catch (e) {
                    console.error("Erro ao salvar configuração", e);
                }
            } else {
                showToast('Esta opção já existe!', 'info');
            }
        }
    };

    // Modal de Edição de Controle
    const modalEditarOpcao = document.getElementById('modalEditarOpcao');
    const inputEditarOpcao = document.getElementById('inputEditarOpcao');
    const btnCancelEditarOpcao = document.getElementById('btnCancelEditarOpcao');
    const btnConfirmEditarOpcao = document.getElementById('btnConfirmEditarOpcao');

    // Modal de Lote de Assessores
    const modalLoteAssessores = document.getElementById('modalLoteAssessores');
    const btnCancelLoteAssessores = document.getElementById('btnCancelLoteAssessores');
    const btnCloseLoteAssessores = document.getElementById('btnCloseLoteAssessores');
    const formLoteAssessores = document.getElementById('formLoteAssessores');

    window.openLoteAssessoresModal = () => {
        document.getElementById('inputListaAssessores').value = '';
        modalLoteAssessores.classList.add('active');
    };

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
            nomes.forEach(val => {
                if (!configuracoes.assessores.includes(val)) {
                    configuracoes.assessores.push(val);
                    adicionados++;
                }
            });

            if (adicionados > 0) {
                configuracoes.assessores.sort();
                try {
                    await supabaseClient.from("configuracoes").upsert([{ "id": "geral", "dados": configuracoes }]);
                    registrarLog('Adicionou Assessores em Lote', `Foram adicionados ${adicionados} novos assessores.`);
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
        const item = configuracoes[type][index];
        const colorInput = document.getElementById('colorEditarOpcao');
        
        inputEditarOpcao.value = type === 'assessores' ? item : item.nome;
        
        if (type === 'assessores') {
            colorInput.style.display = 'none';
        } else {
            colorInput.style.display = 'block';
            colorInput.value = item.cor || '#8b5cf6';
        }
        
        modalEditarOpcao.classList.add('active');
    };

    const closeEditControleModal = () => {
        modalEditarOpcao.classList.remove('active');
    };

    if (btnCancelEditarOpcao) btnCancelEditarOpcao.addEventListener('click', closeEditControleModal);
    
    if (btnConfirmEditarOpcao) {
        btnConfirmEditarOpcao.addEventListener('click', async () => {
            const val = inputEditarOpcao.value.trim();
            const cor = document.getElementById('colorEditarOpcao').value;
            const { type, index } = editControleParams;
            if(val && type) {
                let exists = false;
                if(type === 'assessores') {
                    exists = configuracoes[type].includes(val) && configuracoes[type][index] !== val;
                } else {
                    exists = configuracoes[type].some((x, i) => x.nome.toLowerCase() === val.toLowerCase() && i !== index);
                }

                if(exists) {
                    showToast('Esta opção já existe!', 'info');
                } else {
                    if (type === 'assessores') {
                        configuracoes[type][index] = val;
                        configuracoes[type].sort();
                    } else {
                        configuracoes[type][index] = { nome: val, cor: cor };
                        configuracoes[type].sort((a,b) => a.nome.localeCompare(b.nome));
                    }
                    
                    try {
                        await supabaseClient.from("configuracoes").upsert([{ "id": "geral", "dados": configuracoes }]);
                        registrarLog('Editou Opção de Controle', `A opção "${val}" foi editada em ${type}.`);
                        closeEditControleModal();
                    } catch (e) {
                        console.error("Erro ao atualizar configuração", e);
                    }
                }
            }
        });
    }
    
    // Adicionar eventos de Enter para inputs do Controle
    const mapInputToType = {
        'inputNovoResponsavel': 'responsaveis',
        'inputNovoAssessor': 'assessores',
        'inputNovoMeio': 'meios'
    };
    
    Object.keys(mapInputToType).forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    window.addControleItem(mapInputToType[id]);
                }
            });
        }
    });

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
                if(inputUsuarioSenha) inputUsuarioSenha.value = '********'; // Simulação
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
            } else {
                await supabaseClient.from("usuarios").insert([userData]);
                registrarLog('Criou Usuário', `O usuário ${userData.nome} (${userData.email}) com nível ${userData.nivel} foi criado.`);
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
        if(!tbody) return;
        tbody.innerHTML = '';

        if (usuarios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="padding: 30px;">Nenhum usuário cadastrado.</td></tr>';
            return;
        }

        usuarios.forEach(user => {
            const tr = document.createElement('tr');
            
            let badgeClass = 'badge-viewer';
            if(user.nivel === 'Master') badgeClass = 'badge-master';
            if(user.nivel === 'Administrador') badgeClass = 'badge-admin';
            if(user.nivel === 'Editor') badgeClass = 'badge-editor';

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
    const sectionTipo = document.getElementById('formSectionTipo');
    const inputGuiaTipoSelect = document.getElementById('inputGuiaTipoSelect');
    
    // Switch between Caminho and Tipo
    const switchGuiaModalMode = (mode) => {
        if (mode === 'caminho') {
            btnToggleCaminho.classList.add('active');
            btnToggleTipo.classList.remove('active');
            inputGuiaTipoForm.value = 'caminho';
            
            sectionCaminho.style.display = 'block';
            sectionTipo.style.display = 'none';
            document.getElementById('inputGuiaTitulo').required = true;
            document.getElementById('inputGuiaTipoSelect').required = true;
            document.getElementById('inputGuiaNomeTipo').required = false;
            document.getElementById('modalNovaGuiaTitle').textContent = currentEditGuiaId ? "Editar guia" : "Criar nova guia";
        } else {
            btnToggleTipo.classList.add('active');
            btnToggleCaminho.classList.remove('active');
            inputGuiaTipoForm.value = 'tipo';
            
            sectionCaminho.style.display = 'none';
            sectionTipo.style.display = 'block';
            document.getElementById('inputGuiaTitulo').required = false;
            document.getElementById('inputGuiaTipoSelect').required = false;
            document.getElementById('inputGuiaNomeTipo').required = true;
            document.getElementById('modalNovaGuiaTitle').textContent = "Criar novo tipo";
        }
    };

    if(btnToggleCaminho) btnToggleCaminho.addEventListener('click', () => switchGuiaModalMode('caminho'));
    if(btnToggleTipo) btnToggleTipo.addEventListener('click', () => switchGuiaModalMode('tipo'));

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
            
            switchGuiaModalMode('caminho');
            document.getElementById('guiaModalToggleRow').style.display = 'none';
            document.querySelector('#modalNovaGuiaTitle').textContent = "Editar guia";
            document.querySelector('#formNovaGuia .btn-submit').textContent = "Salvar";
        } else {
            formNovaGuia.reset();
            switchGuiaModalMode('caminho');
            document.getElementById('guiaModalToggleRow').style.display = 'flex';
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
            
            const isCaminho = inputGuiaTipoForm.value === 'caminho';
            
            try {
                if (!isCaminho) {
                    // Creating new Tipo
                    const novoTipo = document.getElementById('inputGuiaNomeTipo').value.trim();
                    if (configuracoes.guiaTipos && configuracoes.guiaTipos.includes(novoTipo)) {
                        showToast("Este tipo já existe!", "warning");
                    } else {
                        if(!configuracoes.guiaTipos) configuracoes.guiaTipos = [];
                        configuracoes.guiaTipos.push(novoTipo);
                        configuracoes.guiaTipos.sort();
                        await supabaseClient.from("configuracoes").upsert([{ "id": "geral", "dados": configuracoes }]);
                        showToast(`Tipo "${novoTipo}" criado com sucesso!`, "success");
                        registrarLog('Criou Tipo de Guia', `O tipo ${novoTipo} foi adicionado.`);
                    }
                } else {
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
                        showToast("Nova guia criada com sucesso!", "success");
                        registrarLog('Criou Guia', `Guia: ${dataObj.titulo}`);
                    }
                }
                modalNovaGuia.classList.remove('active');
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
        if(!filterGuiaTipo) return;
        const currentVal = filterGuiaTipo.value;
        filterGuiaTipo.innerHTML = '<option value="">Tipo (Todos)</option>';
        if(configuracoes.guiaTipos) {
            configuracoes.guiaTipos.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t; opt.textContent = t;
                if(t === currentVal) opt.selected = true;
                filterGuiaTipo.appendChild(opt);
            });
        }
    };

    if(inputBuscarGuia) inputBuscarGuia.addEventListener('input', () => renderGuias());
    if(filterGuiaTipo) filterGuiaTipo.addEventListener('change', () => renderGuias());
    if(btnResetGuia) {
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
        if(!g) return;
        
        document.getElementById('viewGuiaTitulo').textContent = g.titulo || g.tipo || 'Sem Título';
        
        const conteudoEl = document.getElementById('viewGuiaConteudo');
        if(g.conteudo) {
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
        if(!tbody) return;
        
        const searchQueryGuia = (document.getElementById('inputBuscarGuia')?.value || '').toLowerCase();
        const tipoQueryGuia = document.getElementById('filterGuiaTipo')?.value || '';
        
        let filtered = guias;

        if(tipoQueryGuia) {
            filtered = filtered.filter(g => g.tipo === tipoQueryGuia);
        }
        
        if(searchQueryGuia) {
            filtered = filtered.filter(g => 
                (g.titulo && g.titulo.toLowerCase().includes(searchQueryGuia)) ||
                (g.conteudo && g.conteudo.toLowerCase().includes(searchQueryGuia)) ||
                (g.tipo && g.tipo.toLowerCase().includes(searchQueryGuia))
            );
        }
        
        // Sort newest first by default
        filtered.sort((a,b) => (b.dataAtualizacao || 0) - (a.dataAtualizacao || 0));
        
        tbody.innerHTML = '';
        if(filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Nenhuma guia encontrada.</td></tr>`;
            return;
        }
        
        filtered.forEach(g => {
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
    };
    

    const renderLogs = () => {
        const tbody = document.getElementById('logTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (logsAcoes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="padding: 30px;">Nenhuma ação registrada ainda.</td></tr>';
            return;
        }

        logsAcoes.forEach(log => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="white-space: nowrap;"><i class="ph ph-clock"></i> ${log.dataHora}</td>
                <td><strong>${log.usuario}</strong></td>
                <td><span class="pill pill-black">${log.acao}</span></td>
                <td>${log.detalhes}</td>
            `;
            tbody.appendChild(tr);
        });
    };

    const btnClearLogs = document.getElementById('btnClearLogs');
    if (btnClearLogs) {
        btnClearLogs.addEventListener('click', async () => {
            if (confirm("Tem certeza que deseja limpar todo o histórico de movimentações? Esta ação não pode ser desfeita.")) {
                try {
                    const { error: _err9 } = await supabaseClient.from("logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                if (_err9) throw _err9;
                    showToast("Histórico limpo com sucesso!", "success");
                } catch(err) {
                    console.error("Erro ao limpar logs:", err);
                    showToast(`Erro ao limpar histórico.. Detalhe: ${(typeof error !== "undefined" && error) ? error.message : "Desconhecido"}`, "error");
                }
            }
        });
    }

    renderLogs();

    if (userAccessLevel === 'Editor') {
        const navLog = document.getElementById('navLog');
        if (navLog) navLog.style.display = 'none';
    }

    // ==========================================
    // Render inicial
    // ==========================================
    updateFilterOptions();
    renderTables();
    renderSelectOptions();
    renderControleLists();
    renderUsuarios();
    renderLogs();
});
