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
let configuracoes = { responsaveis: [], assessores: [], meios: [] };
let usuarios = [];
let guias = [];
let lembretes = [];
let notificacoes = [];

// ==========================================
// CONFIGURAÇÕES PESSOAIS (POR USUÁRIO)
// ==========================================
let personalConfig = {
    theme: localStorage.getItem('theme') || 'dark',
    soundVolume: 100,
    soundTone: 'padrao',
    lembreteSoundVolume: 100,
    lembreteSoundTone: 'alarme_despertador',
    limiteLinhas: {
        abertas: 50,
        historico: 50,
        guias: 10,
        controle: 25,
        lembretes: 10,
        notificacoes: 50,
        acessos: 10
    }
};

function getPersonalConfigKey() {
    const email = (typeof loggedUser !== 'undefined' && loggedUser && loggedUser.email) ? loggedUser.email : 'local_default';
    return 'user_config_' + email;
}

function loadPersonalConfig() {
    const key = getPersonalConfigKey();
    try {
        const saved = localStorage.getItem(key);
        if (saved) {
            const parsed = JSON.parse(saved);
            personalConfig = {
                ...personalConfig,
                ...parsed,
                limiteLinhas: {
                    ...personalConfig.limiteLinhas,
                    ...(parsed.limiteLinhas || {})
                }
            };
        }
    } catch (e) {
        console.warn('Erro ao carregar configuracoes locais:', e);
    }
    return personalConfig;
}
window.loadPersonalConfig = loadPersonalConfig;
loadPersonalConfig();

function getCurrentUserStorageKey(prefix) {
    const email = (typeof loggedUser !== 'undefined' && loggedUser && loggedUser.email)
        ? loggedUser.email.toLowerCase().trim().replace(/[^a-z0-9_.-]/g, '_')
        : 'local_default';
    return `${prefix}_${email}`;
}
window.getCurrentUserStorageKey = getCurrentUserStorageKey;

function getCurrentUserSupabaseId(prefix) {
    const email = (typeof loggedUser !== 'undefined' && loggedUser && loggedUser.email)
        ? loggedUser.email.toLowerCase().trim()
        : 'local_default';
    return `${prefix}_${email}`;
}
window.getCurrentUserSupabaseId = getCurrentUserSupabaseId;

async function syncPersonalConfigFromSupabase() {
    if (!loggedUser || !loggedUser.email || typeof supabaseClient === 'undefined') return;
    try {
        const userRowId = 'user_' + loggedUser.email;
        const { data, error } = await supabaseClient
            .from('configuracoes')
            .select('dados')
            .eq('id', userRowId)
            .maybeSingle();

        if (data && data.dados) {
            const dbPersonal = data.dados;
            personalConfig = {
                ...personalConfig,
                ...dbPersonal,
                limiteLinhas: {
                    ...personalConfig.limiteLinhas,
                    ...(dbPersonal.limiteLinhas || {})
                }
            };
            try {
                localStorage.setItem(getPersonalConfigKey(), JSON.stringify(personalConfig));
            } catch(e) {}

            if (personalConfig.theme === 'light') {
                document.documentElement.classList.add('light-mode');
                localStorage.setItem('theme', 'light');
            } else if (personalConfig.theme === 'dark') {
                document.documentElement.classList.remove('light-mode');
                localStorage.setItem('theme', 'dark');
            }

            if (typeof renderConfiguracoes === 'function') renderConfiguracoes();
            if (typeof renderTables === 'function') renderTables();
            if (typeof renderControleTable === 'function') renderControleTable();
            if (typeof renderGuias === 'function') renderGuias();
            if (typeof renderLembretes === 'function') renderLembretes();
            if (typeof renderNotificacoes === 'function') renderNotificacoes();
        }
    } catch (err) {}
}
window.syncPersonalConfigFromSupabase = syncPersonalConfigFromSupabase;

async function savePersonalConfig() {
    const key = getPersonalConfigKey();
    try {
        localStorage.setItem(key, JSON.stringify(personalConfig));
    } catch (e) {}

    if (typeof loggedUser !== 'undefined' && loggedUser && loggedUser.email && typeof supabaseClient !== 'undefined') {
        try {
            const userRowId = 'user_' + loggedUser.email;
            await supabaseClient.from('configuracoes').upsert([{
                id: userRowId,
                dados: personalConfig
            }]);
        } catch (err) {
            console.error('Erro ao salvar configuracoes pessoais no Supabase:', err);
        }
    }
}
window.savePersonalConfig = savePersonalConfig;

const appPagesList = [
    { key: 'demandas_abertas', label: 'Demandas em aberto', defaultChecked: true },
    { key: 'demandas_encerradas', label: 'Demandas encerradas', defaultChecked: true },
    { key: 'controle', label: 'Controle', defaultChecked: false },
    { key: 'tutoriais', label: 'Tutoriais', defaultChecked: true },
    { key: 'lembretes', label: 'Lembretes', defaultChecked: false },
    { key: 'notificacoes', label: 'Notificações', defaultChecked: false },
    { key: 'configuracoes', label: 'Configurações', defaultChecked: true },
    { key: 'acessos', label: 'Acessos', defaultChecked: false }
];
window.appPagesList = appPagesList;

function getPermissoesForNivel(nivel) {
    if (!configuracoes) configuracoes = {};
    if (!configuracoes.permissoes) configuracoes.permissoes = {};
    const defaultCheckedKeys = ['demandas_abertas', 'demandas_encerradas', 'tutoriais', 'configuracoes'];

    if (nivel === 'Master') {
        const perms = {};
        appPagesList.forEach(p => {
            perms[p.key] = { acesso: true, apenasVisualizar: false };
        });
        configuracoes.permissoes['Master'] = perms;
        return perms;
    }

    if (!configuracoes.permissoes[nivel]) {
        const perms = {};
        appPagesList.forEach(p => {
            const isDefault = defaultCheckedKeys.includes(p.key);
            perms[p.key] = {
                acesso: isDefault,
                apenasVisualizar: nivel === 'Visualizador'
            };
        });
        configuracoes.permissoes[nivel] = perms;
    } else {
        const perms = configuracoes.permissoes[nivel];
        appPagesList.forEach(p => {
            const val = perms[p.key];
            if (typeof val === 'boolean') {
                perms[p.key] = {
                    acesso: val,
                    apenasVisualizar: false
                };
            } else if (!val || typeof val !== 'object') {
                const isDefault = defaultCheckedKeys.includes(p.key);
                perms[p.key] = {
                    acesso: isDefault,
                    apenasVisualizar: false
                };
            } else {
                perms[p.key] = {
                    acesso: val.acesso !== undefined ? !!val.acesso : true,
                    apenasVisualizar: val.apenasVisualizar !== undefined ? !!val.apenasVisualizar : false
                };
            }
        });
        configuracoes.permissoes[nivel] = perms;
    }
    return configuracoes.permissoes[nivel];
}
window.getPermissoesForNivel = getPermissoesForNivel;


function ensureGuiaTipos() {
    if (typeof configuracoes === 'undefined' || !configuracoes) configuracoes = {};
    if (!configuracoes.guiaTipos || !Array.isArray(configuracoes.guiaTipos)) {
        configuracoes.guiaTipos = [];
    }
    const cleanList = [];
    configuracoes.guiaTipos.forEach(t => {
        if (typeof t === 'string' && t.trim() !== '' && t.trim() !== 'Sem grupo') {
            const trimmed = t.trim();
            if (!cleanList.some(x => x.toLowerCase() === trimmed.toLowerCase())) {
                cleanList.push(trimmed);
            }
        }
    });
    if (typeof guias !== 'undefined' && guias && Array.isArray(guias)) {
        guias.forEach(g => {
            if (g && g.tipo && typeof g.tipo === 'string' && g.tipo.trim() !== '' && g.tipo.trim() !== 'Sem grupo') {
                const trimmed = g.tipo.trim();
                if (!cleanList.some(x => x.toLowerCase() === trimmed.toLowerCase())) {
                    cleanList.push(trimmed);
                }
            }
        });
    }
    configuracoes.guiaTipos = cleanList;
    return configuracoes.guiaTipos;
}
window.ensureGuiaTipos = ensureGuiaTipos;

function ensureNiveisAcesso() {
    if (typeof configuracoes === 'undefined' || !configuracoes) configuracoes = {};
    const defaultNiveis = ['Master', 'Editor', 'Visualizador'];
    const niveisSet = new Set(
        (configuracoes.niveisAcesso && Array.isArray(configuracoes.niveisAcesso) && configuracoes.niveisAcesso.length > 0)
            ? configuracoes.niveisAcesso
            : defaultNiveis
    );

    if (typeof usuarios !== 'undefined' && usuarios && Array.isArray(usuarios)) {
        usuarios.forEach(u => {
            if (u && u.nivel && typeof u.nivel === 'string' && u.nivel.trim() !== '') {
                niveisSet.add(u.nivel.trim());
            }
        });
    }

    configuracoes.niveisAcesso = Array.from(niveisSet);
    return configuracoes.niveisAcesso;
}
window.ensureNiveisAcesso = ensureNiveisAcesso;

function escapeAttr(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

let paginationState = {
    abertas: 1,
    historico: 1,
    controle: 1,
    acessos: 1,
    guias: 1,
    tiposGuia: 1,
    niveisAcesso: 1,
    lembretes: 1,
    notificacoes: 1
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

const getCurrentPageLabel = () => {
    if (typeof currentPage !== 'undefined') {
        const labels = {
            'abertas': 'Demandas em aberto',
            'historico': 'Demandas encerradas',
            'controle': 'Controle',
            'ajuda': 'Tutoriais',
            'lembretes': 'Lembretes',
            'notificacoes': 'Notificações',
            'configuracoes': 'Configurações',
            'acessos': 'Gerenciar Acessos'
        };
        return labels[currentPage] || 'Sistema';
    }
    return 'Sistema';
};

const showToast = (message, type = 'success', createFeedNotif = true) => {
    const container = document.getElementById('toastContainer');
    if (container) {
        // Limpar pop-ups anteriores para exibir apenas a notificação mais recente
        container.innerHTML = '';

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
    }

    if (createFeedNotif && typeof criarNotificacao === 'function') {
        criarNotificacao(message, getCurrentPageLabel());
    }
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
    const filterAssessor = document.getElementById('filterAssessor');
    const filterMeio = document.getElementById('filterMeio');
    const filterComQuem = document.getElementById('filterComQuem');

    const navItems = document.querySelectorAll('.nav-item[data-page]');
    const viewAbertas = document.getElementById('viewAbertas');
    const viewHistorico = document.getElementById('viewHistorico');

    // Estado da aplicação
    let currentPage = 'abertas';
    let selectedIds = [];
    let isSubmittingDemand = false;

    // Instâncias do Modal
    let tsResponsavel = null;
    let tsAssessor = null;
    let tsMeio = null;
    let tsComQuem = null;
    let modalDatePicker = null;

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
    let authInitialized = false;
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        const user = session?.user;
        if (!user) {
            loggedUser = null;
            userAccessLevel = null;
            authInitialized = false;
            loginOverlay.style.display = 'flex';
            appContainer.style.display = 'none';
            return;
        }

        // Se a sessão já foi inicializada para o mesmo usuário, não refazer o setup completo
        // nem re-renderizar selects ao alternar abas do navegador ou renovar token em segundo plano
        if (authInitialized && loggedUser && loggedUser.id === user.id && (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN')) {
            loggedUser = user;
            return;
        }
        authInitialized = true;
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

                let currentUserDoc = usuarios.find(u => u.email === user.email);
                if (user.email === 'admin@local.com' || user.displayName === 'Administrador Local') {
                    if (!currentUserDoc) {
                        const newAdmin = { id: '1', nome: 'Administrador Local', email: 'admin@local.com', nivel: 'Master' };
                        usuarios.push(newAdmin);
                        currentUserDoc = newAdmin;
                        await supabaseClient.from('usuarios').insert([newAdmin]);
                    }
                }
                if (currentUserDoc) {
                    loggedUser = user;
                    userAccessLevel = currentUserDoc.nivel;
                    loadPersonalConfig();
                    syncPersonalConfigFromSupabase();
                    if (typeof fetchLembretes === 'function') fetchLembretes();
                    if (typeof fetchNotificacoes === 'function') fetchNotificacoes();

                    await fetchConfiguracoes();
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
    });

    let syncInitialized = false;
    const forceDataRefresh = async () => {
        const { data: dData } = await supabaseClient.from('demandas').select('*');
        if (dData) demandas = dData;
        const { data: hData } = await supabaseClient.from('historico').select('*');
        if (hData) historico = hData;
        renderTables();
    };

    const fetchDemandas = async () => {
        const { data } = await supabaseClient.from('demandas').select('*');
        if (data) {
            demandas = data;
            renderTables();
        }
    };

    const fetchHistorico = async () => {
        const { data } = await supabaseClient.from('historico').select('*');
        if (data) {
            historico = data;
            renderTables();
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
            ensureGuiaTipos();
            ensureNiveisAcesso();
        } else {
            configuracoes = {
                responsaveis: [],
                assessores: [],
                meios: [],
                guiaTipos: [],
                comQuem: [],
                niveisAcesso: ['Master', 'Editor', 'Visualizador'],
                limiteLinhas: { abertas: 50, historico: 50, guias: 10, controle: 25, lembretes: 10, notificacoes: 50, acessos: 10 },
                tempoNotificacoesDias: 7
            };
            await supabaseClient.from('configuracoes').upsert([{ id: 'geral', dados: configuracoes }]);
        }

        if (!configuracoes.limiteLinhas) {
            configuracoes.limiteLinhas = { abertas: 50, historico: 50, guias: 10, controle: 25, lembretes: 10, notificacoes: 50, acessos: 10 };
        }
        if (!configuracoes.tempoNotificacoesDias) {
            configuracoes.tempoNotificacoesDias = 7;
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

        if (typeof applyRBAC === 'function') applyRBAC();
        if (typeof window.renderControleTable === 'function') window.renderControleTable();
        if (typeof renderConfiguracoes === 'function') renderConfiguracoes();
        renderSelectOptions();
        updateFilterOptions();
        renderTables();
    };

    const initDataSync = () => {
        if (syncInitialized) return;
        syncInitialized = true;

        fetchDemandas();
        fetchHistorico();
        fetchConfiguracoes();
        if (typeof fetchLembretes === 'function') fetchLembretes();
        if (typeof fetchNotificacoes === 'function') fetchNotificacoes();

        supabaseClient.channel('demandas_channel').on('postgres_changes', { event: '*', schema: 'public', table: 'demandas' }, fetchDemandas).subscribe();
        supabaseClient.channel('historico_channel').on('postgres_changes', { event: '*', schema: 'public', table: 'historico' }, fetchHistorico).subscribe();
        supabaseClient.channel('configuracoes_channel').on('postgres_changes', { event: '*', schema: 'public', table: 'configuracoes' }, (payload) => {
            const rowId = payload?.new?.id;
            if (!rowId || rowId === 'geral') {
                fetchConfiguracoes();
            } else if (loggedUser && loggedUser.email) {
                const userEmail = loggedUser.email.toLowerCase().trim();
                if (rowId === 'lembretes_' + userEmail) {
                    if (payload.new && payload.new.dados && Array.isArray(payload.new.dados.lista)) {
                        lembretes = payload.new.dados.lista;
                        try { localStorage.setItem(getCurrentUserStorageKey('cd_lembretes'), JSON.stringify(lembretes)); } catch(e) {}
                        renderLembretes();
                    }
                } else if (rowId === 'notificacoes_' + userEmail) {
                    if (payload.new && payload.new.dados && Array.isArray(payload.new.dados.lista)) {
                        notificacoes = payload.new.dados.lista;
                        try { localStorage.setItem(getCurrentUserStorageKey('cd_notificacoes'), JSON.stringify(notificacoes)); } catch(e) {}
                        autoPurgeOldNotificacoes();
                        renderNotificacoes();
                    }
                } else if (rowId === 'user_' + loggedUser.email) {
                    syncPersonalConfigFromSupabase();
                }
            }
        }).subscribe();
    };

    // Função helper para obter data e hora atual formatada
    const getAgoraFormatado = () => {
        const agora = new Date();
        const data = agora.toLocaleDateString('pt-BR');
        const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return `${data} às ${hora}`;
    };


    function getPagePermission(pageKey) {
        if (!userAccessLevel) {
            return { acesso: true, apenasVisualizar: false };
        }
        const perms = typeof getPermissoesForNivel === 'function' ? getPermissoesForNivel(userAccessLevel) : null;
        if (!perms || !perms[pageKey]) {
            return { acesso: true, apenasVisualizar: false };
        }
        const p = perms[pageKey];
        if (typeof p === 'boolean') {
            return { acesso: p, apenasVisualizar: false };
        }
        return {
            acesso: p.acesso !== undefined ? !!p.acesso : true,
            apenasVisualizar: p.apenasVisualizar !== undefined ? !!p.apenasVisualizar : false
        };
    }
    window.getPagePermission = getPagePermission;

    function hasPageAccess(pageKey) {
        if (!userAccessLevel) return true;
        return getPagePermission(pageKey).acesso;
    }
    window.hasPageAccess = hasPageAccess;

    function isPageReadOnly(pageKey) {
        if (!userAccessLevel) return false;
        const perm = getPagePermission(pageKey);
        return !perm.acesso || perm.apenasVisualizar;
    }
    window.isPageReadOnly = isPageReadOnly;

    function applyRBAC() {
        if (!userAccessLevel) return;

        const navMap = {
            'abertas': 'demandas_abertas',
            'historico': 'demandas_encerradas',
            'controle': 'controle',
            'ajuda': 'tutoriais',
            'lembretes': 'lembretes',
            'notificacoes': 'notificacoes',
            'configuracoes': 'configuracoes',
            'acessos': 'acessos'
        };

        navItems.forEach(item => {
            const page = item.dataset.page;
            if (!page) return;
            const pageKey = navMap[page] || page;
            const canAccess = hasPageAccess(pageKey);
            item.style.display = canAccess ? 'flex' : 'none';
        });

        const readOnlyAbertas = isPageReadOnly('demandas_abertas');
        const readOnlyTutoriais = isPageReadOnly('tutoriais');
        const readOnlyAcessos = isPageReadOnly('acessos');
        const readOnlyControle = isPageReadOnly('controle');

        const btnNova = document.getElementById('btnNova');
        const btnNovaDemanda = document.getElementById('btnNovaDemanda');
        const btnDeleteSelected = document.getElementById('btnDeleteSelected');
        const btnTransferSelected = document.getElementById('btnTransferSelected');
        const theadCheck = document.getElementById('selectAll');

        if (btnNova) btnNova.style.display = (currentPage === 'abertas' && !readOnlyAbertas) ? 'flex' : 'none';
        if (btnNovaDemanda) btnNovaDemanda.style.display = (currentPage === 'abertas' && !readOnlyAbertas) ? 'flex' : 'none';
        if (btnDeleteSelected) btnDeleteSelected.style.display = readOnlyAbertas ? 'none' : 'inline-flex';
        if (btnTransferSelected) btnTransferSelected.style.display = readOnlyAbertas ? 'none' : 'inline-flex';
        if (theadCheck) {
            theadCheck.disabled = readOnlyAbertas;
            if (readOnlyAbertas) theadCheck.style.display = 'none';
            else theadCheck.style.display = 'inline-block';
        }

        const btnNovoGuia = document.getElementById('btnNovoGuia');
        const btnGerenciarTiposGuia = document.getElementById('btnGerenciarTiposGuia');
        if (btnNovoGuia) btnNovoGuia.style.display = readOnlyTutoriais ? 'none' : 'flex';
        if (btnGerenciarTiposGuia) btnGerenciarTiposGuia.style.display = readOnlyTutoriais ? 'none' : 'flex';

        const btnAdicionarUsuario = document.getElementById('btnAdicionarUsuario');
        const btnGerenciarNiveisAcesso = document.getElementById('btnGerenciarNiveisAcesso');
        if (btnAdicionarUsuario) btnAdicionarUsuario.style.display = readOnlyAcessos ? 'none' : 'flex';
        if (btnGerenciarNiveisAcesso) btnGerenciarNiveisAcesso.style.display = readOnlyAcessos ? 'none' : 'flex';

        // Esconder botões de adicionar no Controle se apenas visualizador
        const btnAddResponsaveis = document.getElementById('btnAddResponsaveis');
        const btnAddAssessores = document.getElementById('btnAddAssessores');
        const btnAddMeios = document.getElementById('btnAddMeios');
        const btnAddComQuem = document.getElementById('btnAddComQuem');
        if (btnAddResponsaveis) btnAddResponsaveis.style.display = readOnlyControle ? 'none' : 'flex';
        if (btnAddAssessores) btnAddAssessores.style.display = readOnlyControle ? 'none' : 'flex';
        if (btnAddMeios) btnAddMeios.style.display = readOnlyControle ? 'none' : 'flex';
        if (btnAddComQuem) btnAddComQuem.style.display = readOnlyControle ? 'none' : 'flex';

        const readOnlyLembretes = isPageReadOnly('lembretes');
        const btnNovoLembrete = document.getElementById('btnNovoLembrete');
        if (btnNovoLembrete) btnNovoLembrete.style.display = readOnlyLembretes ? 'none' : 'flex';

        // Redirecionar suavemente se a página ativa atual não for permitida para este nível
        const activeNavKey = navMap[currentPage] || currentPage;
        if (!hasPageAccess(activeNavKey)) {
            const firstAllowed = Array.from(navItems).find(navEl => {
                const pk = navMap[navEl.dataset.page] || navEl.dataset.page;
                return hasPageAccess(pk);
            });
            if (firstAllowed) {
                firstAllowed.click();
            }
        }
    }


    let searchQuery = '';
    let sortConfig = { column: 'data', direction: 'desc' };
    let selectedResponsavel = '';
    let selectedAssessor = '';
    let selectedMeio = '';
    let selectedComQuem = '';
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
            if (page !== 'configuracoes') {
                if (typeof stopNotificationSound === 'function') stopNotificationSound();
                if (typeof stopLembreteSound === 'function') stopLembreteSound();
            }
            // Dynamic SPA Routing
            const allViews = ['viewAbertas', 'viewHistorico', 'viewControle', 'viewAjuda', 'viewAcessos', 'viewLembretes', 'viewNotificacoes', 'viewConfiguracoes'];
            const allHeaders = ['headerActionsDemandas', 'headerActionsControle', 'headerActionsGuias', 'headerActionsAcessos', 'headerActionsLembretes', 'headerActionsNotificacoes', 'headerActionsConfiguracoes'];

            allViews.forEach(vId => {
                const el = document.getElementById(vId);
                if (el) el.style.display = 'none';
            });
            allHeaders.forEach(hId => {
                const el = document.getElementById(hId);
                if (el) el.style.display = 'none';
            });

            if (topHeader) topHeader.style.display = 'flex';
            if (headerTitleContainer) {
                headerTitleContainer.style.display = 'flex';
                if (page === 'configuracoes') {
                    headerTitleContainer.style.justifyContent = 'center';
                    headerTitleContainer.style.width = '100%';
                } else {
                    headerTitleContainer.style.justifyContent = 'flex-start';
                    headerTitleContainer.style.width = 'auto';
                }
            }
            countBadge.style.display = 'none';
            const btnNovaDemanda = document.getElementById('btnNovaDemanda');
            if (btnNova) btnNova.style.display = 'none';
            if (btnNovaDemanda) btnNovaDemanda.style.display = 'none';

            if (page === 'abertas') {
                if (document.getElementById('viewAbertas')) document.getElementById('viewAbertas').style.display = 'block';
                if (document.getElementById('headerActionsDemandas')) document.getElementById('headerActionsDemandas').style.display = 'flex';
                pageTitle.textContent = 'Demandas em aberto';
                countBadge.style.display = 'inline-block';
                countBadge.textContent = `( ${demandas.length} )`;
                if (btnNova) btnNova.style.display = 'flex';
                if (btnNovaDemanda) btnNovaDemanda.style.display = 'flex';
            } else if (page === 'historico') {
                if (document.getElementById('viewHistorico')) document.getElementById('viewHistorico').style.display = 'block';
                if (document.getElementById('headerActionsDemandas')) document.getElementById('headerActionsDemandas').style.display = 'flex';
                pageTitle.textContent = 'Demandas encerradas';
                countBadge.style.display = 'inline-block';
                countBadge.textContent = `( ${historico.length} )`;
                if (btnNovaDemanda) btnNovaDemanda.style.display = 'none';
            } else if (page === 'controle') {
                if (document.getElementById('viewControle')) document.getElementById('viewControle').style.display = 'block';
                if (document.getElementById('headerActionsControle')) document.getElementById('headerActionsControle').style.display = 'flex';
                pageTitle.textContent = 'Controle';
            } else if (page === 'ajuda') {
                if (document.getElementById('viewAjuda')) document.getElementById('viewAjuda').style.display = 'block';
                if (document.getElementById('headerActionsGuias')) document.getElementById('headerActionsGuias').style.display = 'flex';
                pageTitle.textContent = 'Tutoriais';
                if (typeof renderGuias === 'function') renderGuias();
            } else if (page === 'lembretes') {
                if (document.getElementById('viewLembretes')) document.getElementById('viewLembretes').style.display = 'block';
                if (document.getElementById('headerActionsLembretes')) document.getElementById('headerActionsLembretes').style.display = 'flex';
                pageTitle.textContent = 'Lembretes';
                if (typeof renderLembretes === 'function') renderLembretes();
            } else if (page === 'notificacoes') {
                if (document.getElementById('viewNotificacoes')) document.getElementById('viewNotificacoes').style.display = 'block';
                if (document.getElementById('headerActionsNotificacoes')) document.getElementById('headerActionsNotificacoes').style.display = 'flex';
                pageTitle.textContent = 'Notificações';
                if (typeof renderNotificacoes === 'function') renderNotificacoes();
            } else if (page === 'configuracoes') {
                if (document.getElementById('viewConfiguracoes')) document.getElementById('viewConfiguracoes').style.display = 'block';
                if (document.getElementById('headerActionsConfiguracoes')) document.getElementById('headerActionsConfiguracoes').style.display = 'none';
                pageTitle.textContent = 'Configurações do sistema';
                if (typeof renderConfiguracoes === 'function') renderConfiguracoes();
            } else if (page === 'acessos') {
                if (document.getElementById('viewAcessos')) document.getElementById('viewAcessos').style.display = 'block';
                if (document.getElementById('headerActionsAcessos')) document.getElementById('headerActionsAcessos').style.display = 'flex';
                pageTitle.textContent = 'Gerenciar Acessos';
                if (typeof renderUsuarios === 'function') renderUsuarios();
            }

            // Reset pagination state
            paginationState = {
                abertas: 1,
                historico: 1,
                controle: 1,
                acessos: 1,
                guias: 1,
                tiposGuia: 1,
                niveisAcesso: 1,
                lembretes: 1,
                notificacoes: 1
            };

            // Preserve filters and selection on page change (não zera os filtros ao trocar de aba)
            selectedIds = [];

            if (typeof updateBulkActionsControle === 'function') {
                const sAll = document.getElementById('selectAllControle');
                if (sAll) sAll.checked = false;
                document.querySelectorAll('.row-checkbox-controle').forEach(cb => cb.checked = false);
                updateBulkActionsControle();
            }

            updateBulkActionsVisibility();
            document.querySelectorAll('.select-all-checkbox').forEach(cb => {
                cb.checked = false;
                cb.indeterminate = false;
            });

            updateFilterOptions();
            renderTables();
            applyRBAC();
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
        if (isPageReadOnly('demandas_abertas')) {
            showToast('Você tem apenas permissão de visualização nesta página.', 'warning');
            return;
        }
        modal.classList.add('active');
        lastDemandEnterTime = 0;
        if (!editingId) {
            form.reset();
            if (tsResponsavel) tsResponsavel.clear();
            if (tsAssessor) tsAssessor.clear();
            if (tsMeio) tsMeio.clear();
            if (tsComQuem) tsComQuem.clear();
            if (modalDatePicker) modalDatePicker.setDate(new Date());
            document.querySelector('#modalNovaDemanda h2').textContent = 'Nova Demanda';
            document.querySelector('#formNovaDemanda .btn-submit').textContent = 'Adicionar';
        }
    };

    const closeModal = () => {
        modal.classList.remove('active');
        editingId = null;
        form.reset();
        if (tsResponsavel) tsResponsavel.clear();
        if (tsAssessor) tsAssessor.clear();
        if (tsMeio) tsMeio.clear();
        if (tsComQuem) tsComQuem.clear();
        if (modalDatePicker) modalDatePicker.setDate(new Date());
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }
    };

    if (btnNova) {
        btnNova.addEventListener('click', (e) => {
            e.preventDefault();
            if (isPageReadOnly('demandas_abertas')) {
                showToast('Você tem apenas permissão de visualização nesta página.', 'warning');
                return;
            }
            btnNova.blur();
            editingId = null;
            if (currentPage === 'abertas') {
                openModal();
            }
        });
    }
    btnClose.addEventListener('click', closeModal);
    btnCancel.addEventListener('click', closeModal);

    // Fechar qualquer pop-up (modal) ao clicar fora no backdrop ou apertar a tecla ESC (exceto o modalAlertaLembrete)
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay') && e.target.classList.contains('active')) {
            if (e.target.id === 'modalAlertaLembrete') return;
            e.target.classList.remove('active');
            if (e.target.id === 'modalNovaDemanda') {
                editingId = null;
            }
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const activeModal = document.querySelector('.modal-overlay.active');
            if (activeModal) {
                if (activeModal.id === 'modalAlertaLembrete') return;
                activeModal.classList.remove('active');
                if (activeModal.id === 'modalNovaDemanda') {
                    editingId = null;
                }
            }
        }
    });

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
                    showToast("Demanda excluída com sucesso!", "success");
                    if (typeof playSuccessSound === 'function') playSuccessSound();
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
                showToast("Opção excluída com sucesso!", "success");
                if (typeof playSuccessSound === 'function') playSuccessSound();

            } else if (deleteType === 'usuario' && actionId) {
                const usuarioRemovido = usuarios.find(u => u.id === actionId);

                const { error: _err2 } = await supabaseClient.from("usuarios").delete().eq("id", String(actionId));
                if (_err2) throw _err2;

                if (usuarioRemovido) {
                    showToast("Usuário excluído com sucesso!", "success");
                    if (typeof playSuccessSound === 'function') playSuccessSound();
                }
            } else if (deleteType === 'guia' && actionId) {
                const guiaRemovida = guias.find(g => g.id === actionId);
                const { error: _err3 } = await supabaseClient.from("guias").delete().eq("id", String(actionId));
                if (_err3) throw _err3;
                if (guiaRemovida) {
                    showToast("Guia deletada com sucesso!", "success");
                    if (typeof playSuccessSound === 'function') playSuccessSound();
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
        if (typeof transferDatePicker !== 'undefined' && transferDatePicker) {
            transferDatePicker.setDate(new Date());
        } else if (inputDataEncerramento) {
            inputDataEncerramento.value = new Date().toISOString().split('T')[0];
        }
        const inputMotivo = document.getElementById('inputMotivoEncerramento');
        const groupMotivo = document.getElementById('groupMotivoEncerramento');
        if (inputMotivo) inputMotivo.value = '';

        const groupData = inputDataEncerramento ? inputDataEncerramento.closest('.form-group') : null;

        if (currentPage === 'historico') {
            document.querySelector('#modalTransferirDemanda h3').textContent = 'Retornar para Abertas';
            document.querySelector('#modalTransferirDemanda p').textContent = 'Deseja retornar esta demanda para as em aberto?';
            if (groupData) groupData.style.display = 'none'; // Esconder input de data
            if (groupMotivo) groupMotivo.style.display = 'none'; // Esconder motivo
        } else {
            document.querySelector('#modalTransferirDemanda h3').textContent = 'Transferir para o Histórico';
            document.querySelector('#modalTransferirDemanda p').textContent = 'Informe a data e o motivo do encerramento.';
            if (groupData) groupData.style.display = 'block'; // Mostrar input de data
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

                        showToast("Demanda transferida para o histórico com sucesso!", "success");
                        if (typeof playSuccessSound === 'function') playSuccessSound();
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

                        showToast("Demanda retornada para as abertas com sucesso!", "success");
                        if (typeof playSuccessSound === 'function') playSuccessSound();
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
        const currResp = filterResponsavel ? filterResponsavel.value : selectedResponsavel;
        const currAssessor = filterAssessor ? filterAssessor.value : selectedAssessor;
        const currMeio = filterMeio ? filterMeio.value : selectedMeio;
        const currComQuem = filterComQuem ? filterComQuem.value : selectedComQuem;

        if (filterResponsavel) {
            filterResponsavel.innerHTML = '<option value="">Filtrar responsável</option>';
            if (configuracoes.responsaveis) {
                configuracoes.responsaveis.forEach(r => {
                    const opt = document.createElement('option');
                    opt.value = r.nome || r; opt.textContent = r.nome || r;
                    if ((r.nome || r) === currResp) opt.selected = true;
                    filterResponsavel.appendChild(opt);
                });
            }
        }

        if (filterAssessor) {
            filterAssessor.innerHTML = '<option value="">Filtrar assessor</option>';
            if (configuracoes.assessores) {
                configuracoes.assessores.forEach(a => {
                    const opt = document.createElement('option');
                    opt.value = a.nome || a; opt.textContent = a.nome || a;
                    if ((a.nome || a) === currAssessor) opt.selected = true;
                    filterAssessor.appendChild(opt);
                });
            }
        }

        if (filterMeio) {
            filterMeio.innerHTML = '<option value="">Filtrar por caminho</option>';
            if (configuracoes.meios) {
                configuracoes.meios.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m.nome || m; opt.textContent = m.nome || m;
                    if ((m.nome || m) === currMeio) opt.selected = true;
                    filterMeio.appendChild(opt);
                });
            }
        }

        if (filterComQuem) {
            filterComQuem.innerHTML = '<option value="">Filtrar por com a/o</option>';
            if (configuracoes.comQuem) {
                configuracoes.comQuem.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.nome || c; opt.textContent = c.nome || c;
                    if ((c.nome || c) === currComQuem) opt.selected = true;
                    filterComQuem.appendChild(opt);
                });
            }
        }

        if (typeof updateGuiaFilterOptions === 'function') {
            updateGuiaFilterOptions();
        }
        if (typeof updateNivelAcessoFilterOptions === 'function') {
            updateNivelAcessoFilterOptions();
        }
        if (typeof syncCustomFilterDropdowns === 'function') {
            syncCustomFilterDropdowns();
        }
    };

    const initCustomFilterDropdowns = () => {
        const setupDropdown = (dropdownId, selectEl, defaultLabel, getBadgeColor) => {
            const dropdown = document.getElementById(dropdownId);
            if (!dropdown || !selectEl) return;

            const btn = dropdown.querySelector('.custom-dropdown-btn');
            const label = dropdown.querySelector('.custom-dropdown-label');
            const menu = dropdown.querySelector('.custom-dropdown-menu');

            btn.onclick = (e) => {
                e.stopPropagation();
                const wasActive = dropdown.classList.contains('active');
                document.querySelectorAll('.custom-dropdown.active').forEach(d => d.classList.remove('active'));
                if (!wasActive) dropdown.classList.add('active');
            };

            const renderMenu = () => {
                menu.innerHTML = '';
                Array.from(selectEl.options).forEach(opt => {
                    const item = document.createElement('div');
                    item.className = 'custom-dropdown-item' + (opt.value === selectEl.value ? ' selected' : '');

                    const content = document.createElement('div');
                    content.className = 'custom-dropdown-item-content';

                    const color = getBadgeColor ? getBadgeColor(opt.value) : null;
                    if (color) {
                        const dot = document.createElement('span');
                        dot.className = 'custom-dropdown-item-dot';
                        dot.style.backgroundColor = color;
                        content.appendChild(dot);
                    } else if (opt.value === '') {
                        const allIcon = document.createElement('i');
                        allIcon.className = 'ph ph-squares-four';
                        allIcon.style.fontSize = '14px';
                        allIcon.style.color = '#c4b5fd';
                        content.appendChild(allIcon);
                    }

                    const textSpan = document.createElement('span');
                    const itemText = opt.value === '' ? `${defaultLabel} (Todos)` : opt.text;
                    textSpan.textContent = itemText;
                    textSpan.title = itemText;
                    content.appendChild(textSpan);

                    item.appendChild(content);

                    if (opt.value === selectEl.value && opt.value !== '') {
                        const check = document.createElement('i');
                        check.className = 'ph ph-check';
                        item.appendChild(check);
                    }

                    item.onclick = (e) => {
                        e.stopPropagation();
                        selectEl.value = opt.value;
                        label.textContent = opt.value === '' ? defaultLabel : opt.text;
                        dropdown.classList.remove('active');
                        selectEl.dispatchEvent(new Event('change'));
                        renderMenu();
                    };

                    menu.appendChild(item);
                });

                const currentSelected = selectEl.options[selectEl.selectedIndex];
                label.textContent = (currentSelected && currentSelected.value) ? currentSelected.text : defaultLabel;
            };

            dropdown._renderMenu = renderMenu;
            renderMenu();
        };

        setupDropdown('dropdownFilterResponsavel', filterResponsavel, 'Filtrar responsável', (val) => {
            const item = (configuracoes.responsaveis || []).find(r => (r.nome || r) === val);
            return item ? item.cor : null;
        });

        setupDropdown('dropdownFilterAssessor', filterAssessor, 'Filtrar assessor', () => '#8b5cf6');

        setupDropdown('dropdownFilterMeio', filterMeio, 'Filtrar por caminho', (val) => {
            const item = (configuracoes.meios || []).find(m => (m.nome || m) === val);
            return item ? item.cor : null;
        });

        setupDropdown('dropdownFilterComQuem', filterComQuem, 'Filtrar por com a/o', (val) => {
            const item = (configuracoes.comQuem || []).find(c => (c.nome || c) === val);
            return item ? item.cor : null;
        });

        const selectCatControle = document.getElementById('selectCategoriaControle');
        if (selectCatControle) {
            setupDropdown('dropdownSelectCategoriaControle', selectCatControle, 'Responsáveis', null);
        }

        const filterGuiaTipoEl = document.getElementById('filterGuiaTipo');
        if (filterGuiaTipoEl && document.getElementById('dropdownFilterGuiaTipo')) {
            setupDropdown('dropdownFilterGuiaTipo', filterGuiaTipoEl, 'Grupo', null);
        }

        const filterNivelAcessoEl = document.getElementById('filterNivelAcesso');
        if (filterNivelAcessoEl && document.getElementById('dropdownFilterNivelAcesso')) {
            setupDropdown('dropdownFilterNivelAcesso', filterNivelAcessoEl, 'Nível de acesso', null);
        }

        const selectTempoNotifEl = document.getElementById('selectTempoNotificacoes');
        if (selectTempoNotifEl && document.getElementById('dropdownTempoNotificacoes')) {
            setupDropdown('dropdownTempoNotificacoes', selectTempoNotifEl, '7 dias', null);
        }

        const selectSoundToneEl = document.getElementById('selectSoundTone');
        if (selectSoundToneEl && document.getElementById('dropdownSelectSoundTone')) {
            setupDropdown('dropdownSelectSoundTone', selectSoundToneEl, '1. Padrão (Suave)', null);
        }

        const selectLembreteSoundToneEl = document.getElementById('selectLembreteSoundTone');
        if (selectLembreteSoundToneEl && document.getElementById('dropdownSelectLembreteSoundTone')) {
            setupDropdown('dropdownSelectLembreteSoundTone', selectLembreteSoundToneEl, '1. Alarme Despertador (~7.5s)', null);
        }

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.custom-dropdown')) {
                document.querySelectorAll('.custom-dropdown.active').forEach(d => d.classList.remove('active'));
            }
        });
    };

    const syncCustomFilterDropdowns = () => {
        ['dropdownFilterResponsavel', 'dropdownFilterAssessor', 'dropdownFilterMeio', 'dropdownFilterComQuem', 'dropdownSelectCategoriaControle', 'dropdownFilterGuiaTipo', 'dropdownFilterNivelAcesso', 'dropdownTempoNotificacoes', 'dropdownSelectSoundTone', 'dropdownSelectLembreteSoundTone'].forEach(id => {
            const el = document.getElementById(id);
            if (el && el._renderMenu) el._renderMenu();
        });
    };

    initCustomFilterDropdowns();

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
        if (selectedAssessor) {
            result = result.filter(d => d.assessor === selectedAssessor);
        }
        if (selectedMeio) {
            result = result.filter(d => d.meio === selectedMeio);
        }
        if (selectedComQuem) {
            result = result.filter(d => d.comQuem === selectedComQuem);
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
        const limit = (personalConfig && personalConfig.limiteLinhas && personalConfig.limiteLinhas[pageKey])
            ? parseInt(personalConfig.limiteLinhas[pageKey], 10)
            : ((configuracoes && configuracoes.limiteLinhas && configuracoes.limiteLinhas[pageKey]) ? parseInt(configuracoes.limiteLinhas[pageKey], 10) : (isAbertas ? 50 : 50));

        const totalPages = Math.ceil(sourceData.length / limit) || 1;
        if (paginationState[pageKey] > totalPages) paginationState[pageKey] = totalPages;

        const start = (paginationState[pageKey] - 1) * limit;
        const pagedData = sourceData.slice(start, start + limit);

        if (isAbertas) {
            tableBody.innerHTML = '';

            if (pagedData.length === 0) {
                const emptyTr = document.createElement('tr');
                emptyTr.className = 'empty-state-row';
                emptyTr.innerHTML = `
                    <td colspan="11" class="empty-state-cell">
                        <i class="ph ph-magnifying-glass"></i>
                        <span>Nenhuma demanda encontrada.</span>
                    </td>
                `;
                tableBody.appendChild(emptyTr);
            } else {
                const readOnly = isPageReadOnly('demandas_abertas');
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

                    const actionsCol = readOnly ? '' : `
                        <td style="text-align: center; white-space: nowrap; width: 1%;">
                            <div style="display: inline-flex; gap: 4px; justify-content: center; align-items: center;">
                                <button class="action-btn transfer" title="Transferir para o Histórico" onclick="transferirDemanda('${d.id}')"><i class="ph ph-arrows-left-right"></i></button>
                                <button class="action-btn edit" title="Editar" onclick="editDemanda('${d.id}')"><i class="ph ph-pencil-simple"></i></button>
                                <button class="action-btn delete" title="Excluir" onclick="deleteDemanda('${d.id}')"><i class="ph ph-trash"></i></button>
                            </div>
                        </td>
                    `;

                    tr.innerHTML = `
                        <td style="text-align: center;">
                            <input type="checkbox" class="row-checkbox" value="${d.id}" ${selectedIds.includes(d.id) ? 'checked' : ''} ${readOnly ? 'disabled' : ''}>
                        </td>
                        <td style="text-align: center;" title="${escapeAttr(d.responsavel || '')}"><span class="pill" ${respStyle}>${d.responsavel}</span></td>
                        <td style="text-align: center;" title="${escapeAttr(d.assessor || '')}">${d.assessor}</td>
                        <td style="text-align: center;" title="${escapeAttr(d.cliente || '')}">${d.cliente}</td>
                        <td style="text-align: center;" title="${escapeAttr(d.demanda || '')}">${d.demanda}</td>
                        <td style="text-align: center;" title="${escapeAttr(d.meio || '')}"><span class="pill" ${meioStyle}>${d.meio}</span></td>
                        <td style="text-align: center;" title="${escapeAttr(d.protocolo || '')}">${d.protocolo || '-'}</td>
                        <td title="${escapeAttr(d.comentarios || '')}">${d.comentarios || '-'}</td>
                        <td style="text-align: center;" title="${escapeAttr(d.comQuem || '')}"><span class="pill" ${quemStyle}>${d.comQuem}</span></td>
                        <td style="text-align: center;"><i class="ph ph-calendar-blank"></i> ${formatDate(d.data)}</td>
                        ${actionsCol}
                    `;
                    tableBody.appendChild(tr);
                });
            }
            countBadge.textContent = `( ${sourceData.length} )`;
            renderPagination('paginationAbertasContainer', 'abertas', sourceData.length, limit, renderTables);

        } else if (currentPage === 'historico') {
            historicoTableBody.innerHTML = '';

            if (pagedData.length === 0) {
                const emptyTr = document.createElement('tr');
                emptyTr.className = 'empty-state-row';
                emptyTr.innerHTML = `
                    <td colspan="11" class="empty-state-cell">
                        <i class="ph ph-check-circle"></i>
                        <span>Nenhuma demanda encerrada encontrada</span>
                    </td>
                `;
                historicoTableBody.appendChild(emptyTr);
            } else {
                const readOnly = isPageReadOnly('demandas_encerradas');
                pagedData.forEach((d) => {
                    const tr = document.createElement('tr');
                    if (selectedIds.includes(d.id)) {
                        tr.classList.add('selected-row');
                    }
                    const respObj = configuracoes.responsaveis.find(r => r.nome === d.responsavel);
                    const meioObj = configuracoes.meios.find(m => m.nome === d.meio);

                    const respStyle = respObj && respObj.cor ? `style="background-color: ${respObj.cor}; color: #fff; border: none;"` : 'class="pill pill-red"';
                    const meioStyle = meioObj && meioObj.cor ? `style="background-color: ${meioObj.cor}; color: #fff; border: none;"` : 'class="pill pill-blue"';

                    const actionsCol = readOnly ? '' : `
                        <td style="text-align: center; white-space: nowrap; width: 1%;">
                            <div style="display: inline-flex; gap: 4px; justify-content: center; align-items: center;">
                                <button class="action-btn transfer" title="Retornar para Abertas" onclick="transferirDemanda('${d.id}')"><i class="ph ph-arrows-left-right"></i></button>
                                <button class="action-btn edit" title="Editar" onclick="editDemanda('${d.id}')"><i class="ph ph-pencil-simple"></i></button>
                                <button class="action-btn delete" title="Excluir" onclick="deleteDemanda('${d.id}')"><i class="ph ph-trash"></i></button>
                            </div>
                        </td>
                    `;

                    tr.innerHTML = `
                        <td style="text-align: center;">
                            <input type="checkbox" class="row-checkbox" value="${d.id}" ${selectedIds.includes(d.id) ? 'checked' : ''} ${readOnly ? 'disabled' : ''}>
                        </td>
                        <td style="text-align: center;" title="${escapeAttr(d.responsavel || '')}"><span class="pill" ${respStyle}>${d.responsavel}</span></td>
                        <td style="text-align: center;" title="${escapeAttr(d.assessor || '')}">${d.assessor}</td>
                        <td style="text-align: center;" title="${escapeAttr(d.cliente || '')}">${d.cliente}</td>
                        <td style="text-align: center;" title="${escapeAttr(d.demanda || '')}">${d.demanda}</td>
                        <td style="text-align: center;" title="${escapeAttr(d.meio || '')}"><span class="pill" ${meioStyle}>${d.meio}</span></td>
                        <td style="text-align: center;" title="${escapeAttr(d.protocolo || '')}">${d.protocolo || '-'}</td>
                        <td title="${escapeAttr(d.comentarios || '')}">${d.comentarios || '-'}</td>
                        <td style="text-align: center;"><i class="ph ph-calendar-blank"></i> ${formatDate(d.data)}</td>
                        <td style="text-align: center;"><i class="ph ph-calendar-blank"></i> ${formatDate(d.dataEncerramento)}</td>
                        ${actionsCol}
                    `;
                    historicoTableBody.appendChild(tr);
                });
            }
            countBadge.textContent = `( ${sourceData.length} )`;
            renderPagination('paginationHistoricoContainer', 'historico', sourceData.length, limit, renderTables);
        }

        // Atualizar ícones de ordenação
        tableHeaders.forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            const icon = th.querySelector('i');
            if (icon) icon.className = 'ph ph-arrows-down-up';

            if (th.dataset.col === sortConfig.column) {
                th.classList.add(sortConfig.direction === 'asc' ? 'sort-asc' : 'sort-desc');
                if (icon) icon.className = sortConfig.direction === 'asc' ? 'ph ph-arrow-up' : 'ph ph-arrow-down';
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


            selectedIds = [];
            updateBulkActionsVisibility();
            modalBulkExcluir.classList.remove('active');
            if (typeof playSuccessSound === 'function') playSuccessSound();
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
            if (typeof bulkTransferDatePicker !== 'undefined' && bulkTransferDatePicker) {
                bulkTransferDatePicker.setDate(new Date());
            } else {
                document.getElementById('inputBulkDataEncerramento').value = new Date().toISOString().split('T')[0];
            }

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
            }
            selectedIds = [];
            updateBulkActionsVisibility();
            modalBulkTransferir.classList.remove('active');
            const { data: dData } = await supabaseClient.from('demandas').select('*');
            if (dData) demandas = dData;
            const { data: hData } = await supabaseClient.from('historico').select('*');
            if (hData) historico = hData;
            renderTables();

            if (typeof playSuccessSound === 'function') playSuccessSound();
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
            document.getElementById('inputProtocolo').value = demanda.protocolo === '-' ? '' : demanda.protocolo;
            document.getElementById('inputComentarios').value = demanda.comentarios === '-' ? '' : demanda.comentarios;

            if (tsMeio) tsMeio.setValue(demanda.meio === '-' ? '' : demanda.meio);
            else document.getElementById('inputMeio').value = demanda.meio === '-' ? '' : demanda.meio;

            if (tsComQuem) tsComQuem.setValue(demanda.comQuem === '-' ? '' : demanda.comQuem);
            else document.getElementById('inputComQuem').value = demanda.comQuem === '-' ? '' : demanda.comQuem;

            if (modalDatePicker) modalDatePicker.setDate(demanda.data);
            else document.getElementById('inputData').value = demanda.data;

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

    if (filterResponsavel) {
        filterResponsavel.addEventListener('change', (e) => {
            selectedResponsavel = e.target.value;
            renderTables();
        });
    }

    if (filterAssessor) {
        filterAssessor.addEventListener('change', (e) => {
            selectedAssessor = e.target.value;
            renderTables();
        });
    }

    if (filterMeio) {
        filterMeio.addEventListener('change', (e) => {
            selectedMeio = e.target.value;
            renderTables();
        });
    }

    if (filterComQuem) {
        filterComQuem.addEventListener('change', (e) => {
            selectedComQuem = e.target.value;
            renderTables();
        });
    }

    btnReset.addEventListener('click', () => {
        searchQuery = '';
        inputBuscar.value = '';
        selectedResponsavel = '';
        selectedAssessor = '';
        selectedMeio = '';
        selectedComQuem = '';
        selectedDateInicio = null;
        selectedDateFim = null;
        if (filterResponsavel) filterResponsavel.value = '';
        if (filterAssessor) filterAssessor.value = '';
        if (filterMeio) filterMeio.value = '';
        if (filterComQuem) filterComQuem.value = '';
        if (window.datePickerInstance) {
            window.datePickerInstance.clear();
            document.getElementById('dateFilterValue').textContent = 'Filtrar por data';
        }
        if (typeof syncCustomFilterDropdowns === 'function') {
            syncCustomFilterDropdowns();
        }
        sortConfig = { column: 'data', direction: 'desc' };
        renderTables();
    });

    // Configurar Date Picker
    const btnDateFilter = document.getElementById('btnDateFilter');
    const dateFilterValue = document.getElementById('dateFilterValue');



    // Custom Portuguese Locale for Flatpickr (100% offline e resiliente)
    const flatpickrPtBr = {
        weekdays: {
            shorthand: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
            longhand: ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"]
        },
        months: {
            shorthand: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"],
            longhand: ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
        }
    };

    function enhanceFlatpickrUI(fp, titleText, onClear, onApply) {
        if (!fp || !fp.calendarContainer) return;
        const container = fp.calendarContainer;

        // Custom Month Dropdown (Fiel ao design dos filtros do site)
        const currentMonthElem = container.querySelector('.flatpickr-current-month');
        if (currentMonthElem) {
            const origSelect = currentMonthElem.querySelector('.flatpickr-monthDropdown-months');
            if (origSelect) origSelect.style.display = 'none';

            let monthDropdownWrapper = currentMonthElem.querySelector('.fp-month-custom-dropdown');
            if (!monthDropdownWrapper) {
                monthDropdownWrapper = document.createElement('div');
                monthDropdownWrapper.className = 'custom-dropdown fp-month-custom-dropdown';

                const monthBtn = document.createElement('button');
                monthBtn.type = 'button';
                monthBtn.className = 'custom-dropdown-btn fp-month-btn';

                const monthLabel = document.createElement('span');
                monthLabel.className = 'custom-dropdown-label';

                const monthArrow = document.createElement('i');
                monthArrow.className = 'ph ph-caret-down dropdown-arrow';

                monthBtn.appendChild(monthLabel);
                monthBtn.appendChild(monthArrow);

                const monthMenu = document.createElement('div');
                monthMenu.className = 'custom-dropdown-menu fp-month-dropdown-menu';

                const monthsList = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

                const updateMonthUI = () => {
                    const currentMonthIndex = fp.currentMonth;
                    monthLabel.textContent = monthsList[currentMonthIndex];
                    monthMenu.innerHTML = '';
                    monthsList.forEach((mName, idx) => {
                        const item = document.createElement('div');
                        item.className = 'custom-dropdown-item' + (idx === currentMonthIndex ? ' selected' : '');

                        const content = document.createElement('div');
                        content.className = 'custom-dropdown-item-content';

                        const textSpan = document.createElement('span');
                        textSpan.textContent = mName;
                        content.appendChild(textSpan);
                        item.appendChild(content);

                        if (idx === currentMonthIndex) {
                            const checkIcon = document.createElement('i');
                            checkIcon.className = 'ph ph-check';
                            item.appendChild(checkIcon);
                        }

                        item.addEventListener('click', (e) => {
                            e.stopPropagation();
                            fp.changeMonth(idx, false);
                            monthDropdownWrapper.classList.remove('active');
                            updateMonthUI();
                        });
                        monthMenu.appendChild(item);
                    });
                };

                monthBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const wasActive = monthDropdownWrapper.classList.contains('active');
                    document.querySelectorAll('.custom-dropdown.active').forEach(d => d.classList.remove('active'));
                    if (!wasActive) monthDropdownWrapper.classList.add('active');
                });

                updateMonthUI();
                monthDropdownWrapper.appendChild(monthBtn);
                monthDropdownWrapper.appendChild(monthMenu);

                currentMonthElem.insertBefore(monthDropdownWrapper, currentMonthElem.firstChild);

                if (!fp._customMonthHooked) {
                    fp._customMonthHooked = true;
                    fp.config.onMonthChange.push(() => updateMonthUI());
                    fp.config.onYearChange.push(() => updateMonthUI());
                }
            } else {
                const monthsList = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
                const monthLabel = monthDropdownWrapper.querySelector('.custom-dropdown-label');
                if (monthLabel) monthLabel.textContent = monthsList[fp.currentMonth];
            }
        }

        // Se titleText for fornecido, adiciona Header e Footer (usado no filtro das demandas)
        if (titleText && !container.querySelector('.fp-custom-header')) {
            const header = document.createElement('div');
            header.className = 'fp-custom-header';
            header.innerHTML = `
                <div class="fp-custom-title">
                    <span>${titleText}</span>
                </div>
                <div class="fp-presets-row">
                    <button type="button" class="fp-preset-chip" data-range="today">Hoje</button>
                    <button type="button" class="fp-preset-chip" data-range="7days">7 dias</button>
                    <button type="button" class="fp-preset-chip" data-range="thismonth">Este mês</button>
                    <button type="button" class="fp-preset-chip" data-range="lastmonth">Mês passado</button>
                </div>
            `;

            const footer = document.createElement('div');
            footer.className = 'fp-custom-footer';
            footer.innerHTML = `
                <button type="button" class="fp-action-btn fp-btn-clear">Limpar</button>
                <button type="button" class="fp-action-btn fp-btn-apply">Aplicar</button>
            `;

            container.insertBefore(header, container.firstChild);
            container.appendChild(footer);

            header.querySelectorAll('.fp-preset-chip').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const rangeType = btn.dataset.range;
                    const now = new Date();
                    let start, end;

                    if (rangeType === 'today') {
                        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
                    } else if (rangeType === '7days') {
                        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
                        start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
                        start.setHours(0, 0, 0, 0);
                    } else if (rangeType === 'thismonth') {
                        start = new Date(now.getFullYear(), now.getMonth(), 1);
                        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                    } else if (rangeType === 'lastmonth') {
                        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                        end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
                    }

                    if (start && end) {
                        fp.setDate([start, end], true);
                        header.querySelectorAll('.fp-preset-chip').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                    }
                });
            });

            footer.querySelector('.fp-btn-clear').addEventListener('click', (e) => {
                e.stopPropagation();
                fp.clear();
                header.querySelectorAll('.fp-preset-chip').forEach(b => b.classList.remove('active'));
                if (onClear) onClear();
                fp.close();
            });

            footer.querySelector('.fp-btn-apply').addEventListener('click', (e) => {
                e.stopPropagation();
                if (onApply) onApply();
                fp.close();
            });
        }
    }

    const inputDataEl = document.getElementById('inputData');
    if (inputDataEl) {
        modalDatePicker = flatpickr(inputDataEl, {
            dateFormat: "Y-m-d",
            altInput: true,
            altFormat: "d/m/Y",
            defaultDate: new Date(),
            locale: flatpickrPtBr,
            prevArrow: '<i class="ph ph-caret-left"></i>',
            nextArrow: '<i class="ph ph-caret-right"></i>',
            onReady: function (selectedDates, dateStr, instance) {
                enhanceFlatpickrUI(instance, null);
            },
            onOpen: function (selectedDates, dateStr, instance) {
                enhanceFlatpickrUI(instance, null);
            }
        });
    }

    let transferDatePicker = null;
    const inputDataEncerramentoEl = document.getElementById('inputDataEncerramento');
    if (inputDataEncerramentoEl) {
        transferDatePicker = flatpickr(inputDataEncerramentoEl, {
            dateFormat: "Y-m-d",
            altInput: true,
            altFormat: "d/m/Y",
            defaultDate: new Date(),
            locale: flatpickrPtBr,
            prevArrow: '<i class="ph ph-caret-left"></i>',
            nextArrow: '<i class="ph ph-caret-right"></i>',
            onReady: function (selectedDates, dateStr, instance) {
                enhanceFlatpickrUI(instance, null);
            },
            onOpen: function (selectedDates, dateStr, instance) {
                enhanceFlatpickrUI(instance, null);
            }
        });
    }

    let bulkTransferDatePicker = null;
    const inputBulkDataEncerramentoEl = document.getElementById('inputBulkDataEncerramento');
    if (inputBulkDataEncerramentoEl) {
        bulkTransferDatePicker = flatpickr(inputBulkDataEncerramentoEl, {
            dateFormat: "Y-m-d",
            altInput: true,
            altFormat: "d/m/Y",
            defaultDate: new Date(),
            locale: flatpickrPtBr,
            prevArrow: '<i class="ph ph-caret-left"></i>',
            nextArrow: '<i class="ph ph-caret-right"></i>',
            onReady: function (selectedDates, dateStr, instance) {
                enhanceFlatpickrUI(instance, null);
            },
            onOpen: function (selectedDates, dateStr, instance) {
                enhanceFlatpickrUI(instance, null);
            }
        });
    }

    let lembreteDatePicker = null;
    let lembreteTimePicker = null;

    const inputLembreteDataEl = document.getElementById('inputLembreteData');
    if (inputLembreteDataEl) {
        lembreteDatePicker = flatpickr(inputLembreteDataEl, {
            dateFormat: "Y-m-d",
            altInput: true,
            altFormat: "d/m/Y",
            defaultDate: new Date(),
            locale: flatpickrPtBr,
            prevArrow: '<i class="ph ph-caret-left"></i>',
            nextArrow: '<i class="ph ph-caret-right"></i>',
            onReady: function (selectedDates, dateStr, instance) {
                enhanceFlatpickrUI(instance, null);
            },
            onOpen: function (selectedDates, dateStr, instance) {
                enhanceFlatpickrUI(instance, null);
            }
        });
    }

    const inputLembreteHoraEl = document.getElementById('inputLembreteHora');
    if (inputLembreteHoraEl) {
        lembreteTimePicker = flatpickr(inputLembreteHoraEl, {
            enableTime: true,
            noCalendar: true,
            dateFormat: "H:i",
            time_24hr: true,
            defaultDate: new Date(),
            locale: flatpickrPtBr
        });
    }

    const filterDateRange = document.getElementById('filterDateRange');
    if (btnDateFilter && filterDateRange) {
        window.datePickerInstance = flatpickr(filterDateRange, {
            mode: "range",
            dateFormat: "Y-m-d",
            locale: flatpickrPtBr,
            positionElement: btnDateFilter,
            prevArrow: '<i class="ph ph-caret-left"></i>',
            nextArrow: '<i class="ph ph-caret-right"></i>',
            onReady: function (selectedDates, dateStr, instance) {
                enhanceFlatpickrUI(instance, 'Filtrar demandas por data', () => {
                    selectedDateInicio = null;
                    selectedDateFim = null;
                    dateFilterValue.textContent = 'Filtrar por data';
                    renderTables();
                });
            },
            onOpen: function (selectedDates, dateStr, instance) {
                enhanceFlatpickrUI(instance, 'Filtrar demandas por data', () => {
                    selectedDateInicio = null;
                    selectedDateFim = null;
                    dateFilterValue.textContent = 'Filtrar por data';
                    renderTables();
                });
            },
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
                    dateFilterValue.textContent = 'Filtrar por data';
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
            headers = ['Responsável', 'Assessor', 'Cliente', 'Demanda', 'Caminho', 'Protocolo', 'Comentários', 'Com a/o', 'Data'];
        } else {
            headers = ['Responsável', 'Assessor', 'Cliente', 'Demanda', 'Caminho', 'Protocolo', 'Comentários', 'Data', 'Data de encerramento'];
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

    let lastDemandEnterTime = 0;

    // ==========================================
    // Funções de Validação e Navegação por Enter na Demanda
    // ==========================================
    function getFirstMissingRequiredDemandField() {
        const requiredFields = [
            { id: 'inputResponsavel', label: 'Responsável', getInst: () => tsResponsavel },
            { id: 'inputAssessor', label: 'Assessor', getInst: () => tsAssessor },
            { id: 'inputCliente', label: 'Cliente ou Prospect' },
            { id: 'inputProtocolo', label: 'Protocolo' },
            { id: 'inputDemanda', label: 'Demanda' },
            { id: 'inputMeio', label: 'Caminho', getInst: () => tsMeio },
            { id: 'inputComQuem', label: 'Com a/o', getInst: () => tsComQuem }
        ];

        for (const item of requiredFields) {
            let val = '';
            if (item.getInst) {
                const inst = item.getInst();
                if (inst && typeof inst.getValue === 'function') {
                    val = inst.getValue();
                }
            }
            if (!val) {
                const el = document.getElementById(item.id);
                if (el) {
                    val = el.value;
                }
            }
            val = (val || '').trim();
            if (!val) {
                return item;
            }
        }
        return null;
    }

    function focusDemandField(fieldItem) {
        if (!fieldItem) return;
        if (fieldItem.getInst) {
            const inst = fieldItem.getInst();
            if (inst) {
                inst.focus();
                return;
            }
        }
        const el = document.getElementById(fieldItem.id);
        if (el) {
            el.focus();
            if (typeof el.select === 'function') {
                el.select();
            }
        }
    }

    function isDemandFormFullyFilled() {
        return getFirstMissingRequiredDemandField() === null;
    }

    function focusNextDemandField(currentId) {
        const sequence = [
            { id: 'inputResponsavel', label: 'Responsável', getInst: () => tsResponsavel },
            { id: 'inputAssessor', label: 'Assessor', getInst: () => tsAssessor },
            { id: 'inputCliente', label: 'Cliente ou Prospect' },
            { id: 'inputProtocolo', label: 'Protocolo' },
            { id: 'inputDemanda', label: 'Demanda' },
            { id: 'inputMeio', label: 'Caminho', getInst: () => tsMeio },
            { id: 'inputComQuem', label: 'Com a/o', getInst: () => tsComQuem },
            { id: 'inputData' },
            { id: 'inputComentarios' }
        ];

        const missing = getFirstMissingRequiredDemandField();
        if (missing) {
            focusDemandField(missing);
            return;
        }

        const currentIndex = sequence.findIndex(item => item.id === currentId);
        let nextIndex = currentIndex + 1;
        if (nextIndex >= sequence.length) nextIndex = 0;

        const nextItem = sequence[nextIndex];
        if (nextItem) {
            focusDemandField(nextItem);
        }
    }

    window.handleDemandFieldAdvance = (currentId) => {
        const modal = document.getElementById('modalNovaDemanda');
        if (!modal || !modal.classList.contains('active')) return;
        if (isSubmittingDemand) return;

        lastDemandEnterTime = Date.now();
        setTimeout(() => focusNextDemandField(currentId), 60);
    };

    form.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (e.target.tagName === 'TEXTAREA' && e.shiftKey) return;
            if (!modal.classList.contains('active')) return;

            e.preventDefault();

            if (isSubmittingDemand) return;

            const now = Date.now();
            if (now - lastDemandEnterTime < 500) {
                return;
            }
            lastDemandEnterTime = now;

            const missing = getFirstMissingRequiredDemandField();
            if (missing) {
                showToast(`Preencha o campo "${missing.label}".`, 'warning');
                focusDemandField(missing);
            } else {
                if (document.activeElement && typeof document.activeElement.blur === 'function') {
                    document.activeElement.blur();
                }
                form.requestSubmit();
            }
        }
    });

    // ==========================================
    // Adicionar/Editar Demanda
    // ==========================================
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isSubmittingDemand) return;

        const missing = getFirstMissingRequiredDemandField();
        if (missing) {
            isSubmittingDemand = false;
            showToast(`Preencha o campo "${missing.label}".`, 'warning');
            focusDemandField(missing);
            return;
        }

        isSubmittingDemand = true;

        const resp = (document.getElementById('inputResponsavel')?.value || '').trim();
        const ass = (document.getElementById('inputAssessor')?.value || '').trim();
        const cli = (document.getElementById('inputCliente')?.value || '').trim();
        const prot = (document.getElementById('inputProtocolo')?.value || '').trim();
        const dem = (document.getElementById('inputDemanda')?.value || '').trim();
        const meio = (document.getElementById('inputMeio')?.value || '').trim();
        const quem = (document.getElementById('inputComQuem')?.value || '').trim();

        const btnSubmit = form.querySelector('.btn-submit');
        const originalText = btnSubmit.textContent;
        btnSubmit.textContent = "Aguarde...";
        btnSubmit.disabled = true;

        const dadosFormulario = {
            responsavel: resp,
            assessor: ass,
            cliente: cli,
            demanda: dem,
            meio: meio,
            protocolo: prot,
            comentarios: document.getElementById('inputComentarios')?.value || '-',
            comQuem: quem,
            data: document.getElementById('inputData')?.value || new Date().toISOString().split('T')[0]
        };

        try {
            if (editingId) {
                const collectionName = currentPage === 'abertas' ? "demandas" : "historico";
                await supabaseClient.from(collectionName).update(dadosFormulario).eq("id", String(editingId));
                showToast("Demanda editada com sucesso!", "success");
                if (typeof playSuccessSound === 'function') playSuccessSound();
                if (typeof criarNotificacao === 'function') {
                    criarNotificacao(`Demanda de ${dadosFormulario.cliente} foi atualizada.`, 'Demandas em aberto');
                }
            } else {
                await supabaseClient.from("demandas").insert([dadosFormulario]);
                showToast("Demanda criada com sucesso!", "success");
                if (typeof playSuccessSound === 'function') playSuccessSound();
                if (typeof criarNotificacao === 'function') {
                    criarNotificacao(`Nova demanda criada para ${dadosFormulario.cliente}.`, 'Demandas em aberto');
                }
            }
            closeModal();
            await forceDataRefresh();
        } catch (error) {
            console.error("Erro ao salvar demanda:", error);
            showToast(`Erro ao salvar demanda. Tente novamente.. Detalhe: ${(typeof error !== "undefined" && error) ? error.message : "Desconhecido"}`, 'info');
        } finally {
            btnSubmit.textContent = originalText;
            btnSubmit.disabled = false;
            setTimeout(() => { isSubmittingDemand = false; }, 400);
        }
    });

    // ==========================================
    // Funções de Controle de Opções
    // ==========================================
    function getOptionColor(type, value) {
        if (!value) return null;
        const list = configuracoes[type] || [];
        const item = list.find(o => (o.nome || o) === value);
        if (item && item.cor) return item.cor;
        if (type === 'responsaveis') return '#8b5cf6';
        if (type === 'assessores') return (item && item.cor) ? item.cor : '#8b5cf6'; // Todos assessores padronizados com bolinha roxa
        if (type === 'meios') return '#3b82f6';
        if (type === 'comQuem') return '#10b981';
        return '#a78bfa';
    }

    function createTomSelectWithDots(selector, category) {
        return new TomSelect(selector, {
            create: false,
            sortField: { field: "text", direction: "asc" },
            maxOptions: null,
            allowEmptyOption: false,
            placeholder: "Selecione",
            onItemAdd: function (val) {
                this.setTextboxValue('');
                this.refreshOptions(false);
                this.blur();
                if (val && this.input && this.input.id) {
                    window.handleDemandFieldAdvance(this.input.id);
                }
            },
            onChange: function () {
                this.setTextboxValue('');
                this.refreshOptions(false);
                this.blur();
            },
            onBlur: function () {
                this.setTextboxValue('');
                this.refreshOptions(false);
            },
            render: {
                option: function (data, escape) {
                    if (!data.value) {
                        return `<div class="custom-dropdown-item-content"><span style="color: #a78bfa;">Selecione</span></div>`;
                    }
                    const color = getOptionColor(category, data.value);
                    const dotHtml = color ? `<span class="custom-dropdown-item-dot" style="background-color: ${color};"></span>` : '';
                    return `<div class="custom-dropdown-item-content">${dotHtml}<span>${escape(data.text)}</span></div>`;
                },
                item: function (data, escape) {
                    if (!data.value) {
                        return '';
                    }
                    const color = getOptionColor(category, data.value);
                    const dotHtml = color ? `<span class="custom-dropdown-item-dot" style="background-color: ${color};"></span>` : '';
                    return `<div class="custom-dropdown-item-content">${dotHtml}<span>${escape(data.text)}</span></div>`;
                },
                no_results: function (data, escape) {
                    return `<div class="no-results" style="padding: 8px 12px; color: #94a3b8; font-size: 13px;">Nenhum resultado encontrado</div>`;
                }
            }
        });
    }

    function syncTomSelectField(currentTs, selectId, category, itemsList) {
        const selectEl = document.getElementById(selectId);
        if (!selectEl) return null;

        // Recuperar o valor atual de forma segura (do TomSelect ou do select nativo)
        const currentVal = currentTs ? currentTs.getValue() : selectEl.value;

        if (currentTs) {
            // Se o TomSelect já existe, atualizamos as opções SEM destruí-lo
            // Isso evita zerar a digitação ou a seleção do usuário se o modal estiver aberto!
            currentTs.clearOptions();
            (itemsList || []).forEach(o => {
                const name = o.nome || o;
                currentTs.addOption({ value: name, text: name });
            });
            currentTs.refreshOptions(false);
            if (currentVal) {
                currentTs.setValue(currentVal, true);
            }
            return currentTs;
        } else {
            // Se ainda não foi inicializado, cria o HTML base e inicializa
            selectEl.innerHTML = '<option value="">Selecione</option>';
            (itemsList || []).forEach(o => {
                const name = o.nome || o;
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                if (name === currentVal) opt.selected = true;
                selectEl.appendChild(opt);
            });
            const newTs = createTomSelectWithDots('#' + selectId, category);
            if (currentVal) {
                newTs.setValue(currentVal, true);
            }
            return newTs;
        }
    }

    function renderSelectOptions() {
        tsResponsavel = syncTomSelectField(tsResponsavel, 'inputResponsavel', 'responsaveis', configuracoes.responsaveis);
        tsAssessor = syncTomSelectField(tsAssessor, 'inputAssessor', 'assessores', configuracoes.assessores);
        tsMeio = syncTomSelectField(tsMeio, 'inputMeio', 'meios', configuracoes.meios);
        tsComQuem = syncTomSelectField(tsComQuem, 'inputComQuem', 'comQuem', configuracoes.comQuem);
    };

    const selectAllControle = document.getElementById('selectAllControle');
    const btnBulkExcluirControle = document.getElementById('btnBulkExcluirControle');
    const bulkActionsContainerControle = document.getElementById('bulkActionsContainerControle');
    const bulkSelectedCountControle = document.getElementById('bulkSelectedCountControle');
    const btnCancelBulkControle = document.getElementById('btnCancelBulkControle');

    function updateBulkActionsControle() {
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
                items = [...configuracoes[categoria]];
            }

            const thCheckbox = document.getElementById('thCheckboxControle');

            // Update btnNovaOpcaoControle text dynamically
            const btnNovaOpcao = document.getElementById('btnNovaOpcaoControle');
            if (btnNovaOpcao) {
                let btnText = 'Nova opção';
                if (categoria === 'responsaveis') btnText = 'Novo responsável';
                else if (categoria === 'assessores') btnText = 'Novo assessor';
                else if (categoria === 'meios') btnText = 'Novo meio';
                else if (categoria === 'comQuem') btnText = 'Novo com quem';
                btnNovaOpcao.innerHTML = btnText;
            }

            // Hide Lote and Cor if it's assessores
            if (categoria === 'assessores') {
                if (btnLote) btnLote.style.display = 'inline-flex';
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
                const emptyTr = document.createElement('tr');
                emptyTr.className = 'empty-state-row';
                emptyTr.innerHTML = `
                    <td colspan="5" class="empty-state-cell">
                        <i class="ph ph-magnifying-glass"></i>
                        <span>Nenhum item encontrado.</span>
                    </td>
                `;
                tbody.appendChild(emptyTr);
                renderPagination('paginationControleContainer', 'controle', 0, 100, window.renderControleTable);
                return;
            }

            const formatDateControle = (d) => {
                if (!d) return '-';
                const dateObj = new Date(d);
                if (isNaN(dateObj.getTime())) return d;
                return `${dateObj.toLocaleDateString('pt-BR')} às ${dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
            };

            const limit = (personalConfig && personalConfig.limiteLinhas && personalConfig.limiteLinhas.controle)
            ? parseInt(personalConfig.limiteLinhas.controle, 10)
            : ((configuracoes && configuracoes.limiteLinhas && configuracoes.limiteLinhas.controle) ? parseInt(configuracoes.limiteLinhas.controle, 10) : 25);
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

                const readOnlyControle = isPageReadOnly('controle');
                const actionsColControle = readOnlyControle ? '' : `
                    <td style="text-align: center; white-space: nowrap; width: 1%;">
                        <div style="display: inline-flex; gap: 4px; justify-content: center; align-items: center;">
                            <button class="action-btn edit" title="Editar" onclick="window.openEditControleModal('${categoria}', ${actionIndex})"><i class="ph ph-pencil-simple"></i></button>
                            <button class="action-btn delete" title="Remover" onclick="window.openDeleteControleModal('${categoria}', ${actionIndex})"><i class="ph ph-trash"></i></button>
                        </div>
                    </td>
                `;

                if (categoria === 'assessores') {
                    tr.innerHTML = `
                        <td style="text-align: center;"><input type="checkbox" class="row-checkbox-controle" value="${actionIndex}" ${readOnlyControle ? 'disabled' : ''}></td>
                        <td>${nome}</td>
                        <td style="text-align: center;">${criadoEm}</td>
                        <td style="text-align: center;">${atualizadoEm}</td>
                        ${actionsColControle}
                    `;
                } else {
                    tr.innerHTML = `
                        <td>${nome}</td>
                        <td style="text-align: center;"><div style="display:flex; justify-content: center;">${cor}</div></td>
                        <td style="text-align: center;">${criadoEm}</td>
                        <td style="text-align: center;">${atualizadoEm}</td>
                        ${actionsColControle}
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
                    configuracoes.assessores.push({ nome: val, cor: '#8b5cf6', criadoEm: now, atualizadoEm: now });
                    adicionados++;
                }
            });

            if (adicionados > 0) {
                configuracoes.assessores.sort((a, b) => (a.nome || a).localeCompare(b.nome || b));
                try {
                    await supabaseClient.from("configuracoes").upsert([{ "id": "geral", "dados": configuracoes }]);
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
        if (type === 'meios') titleName = 'Caminho';
        if (type === 'comQuem') titleName = 'Com a/o';

        if (index !== null) {
            const item = configuracoes[type][index];
            inputEditarOpcao.value = item.nome || item;
            if (titleEditarOpcao) titleEditarOpcao.textContent = `Editar ${titleName}`;
            if (btnConfirmEditarOpcao) btnConfirmEditarOpcao.textContent = 'Salvar';

            if (type === 'assessores' || type === 'guiaTipos') {
                document.getElementById('containerCorEditarOpcao').style.display = 'none';
            } else {
                document.getElementById('containerCorEditarOpcao').style.display = 'flex';
                const colorToSet = item.cor || '#8b5cf6';
                colorInput.value = colorToSet;
                if (window.pickrEditarOpcao) {
                    window.pickrEditarOpcao.setColor(colorToSet);
                    window.pickrEditarOpcao.applyColor(true);
                }
            }
        } else {
            // New Item
            inputEditarOpcao.value = '';
            if (titleEditarOpcao) titleEditarOpcao.textContent = `Novo ${titleName}`;
            if (btnConfirmEditarOpcao) btnConfirmEditarOpcao.textContent = 'Criar';
            if (type === 'assessores' || type === 'guiaTipos') {
                document.getElementById('containerCorEditarOpcao').style.display = 'none';
            } else {
                document.getElementById('containerCorEditarOpcao').style.display = 'flex';
                const colorToSet = '#8b5cf6';
                colorInput.value = colorToSet;
                if (window.pickrEditarOpcao) {
                    window.pickrEditarOpcao.setColor(colorToSet);
                    window.pickrEditarOpcao.applyColor(true);
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
                        if (typeof playSuccessSound === 'function') playSuccessSound();
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
                    if (typeof playSuccessSound === 'function') playSuccessSound();
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
                        // Cascading update if editing an existing option
                        if (!isNew) {
                            let oldName = configuracoes[type][index].nome;
                            if (!oldName && typeof configuracoes[type][index] === 'string') oldName = configuracoes[type][index];

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
                        showToast(isNew ? "Opção criada com sucesso!" : "Opção editada com sucesso!", "success");
                        if (typeof playSuccessSound === 'function') playSuccessSound();
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

    if (inputEditarOpcao) {
        inputEditarOpcao.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const containerCor = document.getElementById('containerCorEditarOpcao');
                const isColorVisible = containerCor && containerCor.style.display !== 'none';

                if (isColorVisible) {
                    const pButton = document.querySelector('#pickrEditarOpcao .pcr-button');
                    if (pButton) {
                        pButton.focus();
                    } else {
                        btnConfirmEditarOpcao?.focus();
                    }
                } else {
                    btnConfirmEditarOpcao?.click();
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
    let tsUsuarioNivel = null;

    function renderUsuarioNivelSelectOptions(selectedVal = '') {
        const sel = document.getElementById('inputUsuarioNivel');
        if (!sel) return;
        if (tsUsuarioNivel) {
            tsUsuarioNivel.destroy();
            tsUsuarioNivel = null;
        }
        const niveis = ensureNiveisAcesso();
        sel.innerHTML = '<option value="">Selecione o nível</option>';
        niveis.forEach(n => {
            sel.innerHTML += `<option value="${n}">${n}</option>`;
        });
        sel.value = selectedVal;
        tsUsuarioNivel = new TomSelect('#inputUsuarioNivel', {
            create: false,
            sortField: { field: "text", direction: "asc" },
            maxOptions: null,
            allowEmptyOption: false,
            placeholder: "Selecione o nível",
            onItemAdd: function (val) {
                this.setTextboxValue('');
                this.refreshOptions(false);
                this.blur();
            },
            onChange: function () {
                this.setTextboxValue('');
                this.refreshOptions(false);
                this.blur();
            },
            onBlur: function () {
                this.setTextboxValue('');
                this.refreshOptions(false);
            }
        });
        if (selectedVal) {
            tsUsuarioNivel.setValue(selectedVal);
        }
    }

    const openUsuarioModal = (id = null) => {
        editingUsuarioId = id;
        if (id) {
            const user = usuarios.find(u => u.id === id);
            if (user) {
                document.getElementById('modalUsuarioTitle').textContent = 'Editar Usuário';
                inputUsuarioNome.value = user.nome;
                inputUsuarioEmail.value = user.email;
                if (inputUsuarioSenha) inputUsuarioSenha.value = '********';
                renderUsuarioNivelSelectOptions(user.nivel || '');
            }
        } else {
            document.getElementById('modalUsuarioTitle').textContent = 'Adicionar Usuário';
            formUsuario.reset();
            renderUsuarioNivelSelectOptions('');
        }
        modalUsuario.classList.add('active');
    };

    const closeUsuarioModal = () => {
        modalUsuario.classList.remove('active');
        editingUsuarioId = null;
        if (tsUsuarioNivel) tsUsuarioNivel.clear();
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
            nome: inputUsuarioNome.value.trim(),
            email: inputUsuarioEmail.value.trim(),
            nivel: (tsUsuarioNivel ? tsUsuarioNivel.getValue() : inputUsuarioNivel.value).trim()
        };

        try {
            if (editingUsuarioId) {
                await supabaseClient.from("usuarios").update(userData).eq("id", String(editingUsuarioId));
                showToast("Usuário editado com sucesso!", "success");
                if (typeof playSuccessSound === 'function') playSuccessSound();
            } else {
                await supabaseClient.from("usuarios").insert([userData]);
                showToast("Usuário criado com sucesso!", "success");
                if (typeof playSuccessSound === 'function') playSuccessSound();
            }

            if (loggedUser && (loggedUser.email === userData.email || userAccessLevel)) {
                const currentUserDoc = usuarios ? usuarios.find(u => u.email === loggedUser.email) : null;
                if (currentUserDoc && currentUserDoc.email === userData.email) {
                    currentUserDoc.nivel = userData.nivel;
                    userAccessLevel = userData.nivel;
                    applyRBAC();
                    renderTables();
                }
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

    const updateNivelAcessoFilterOptions = () => {
        const filterNivel = document.getElementById('filterNivelAcesso');
        if (!filterNivel) return;

        const currentVal = filterNivel.value;
        filterNivel.innerHTML = '<option value="">Nível de acesso</option>';

        const niveisList = ensureNiveisAcesso();

        niveisList.forEach(n => {
            const opt = document.createElement('option');
            opt.value = n; opt.textContent = n;
            if (n === currentVal) opt.selected = true;
            filterNivel.appendChild(opt);
        });

        if (typeof syncCustomFilterDropdowns === 'function') {
            syncCustomFilterDropdowns();
        }
    };

    const inputBuscarUsuario = document.getElementById('inputBuscarUsuario');
    const filterNivelAcesso = document.getElementById('filterNivelAcesso');
    const btnResetAcessos = document.getElementById('btnResetAcessos');

    if (inputBuscarUsuario) inputBuscarUsuario.addEventListener('input', () => renderUsuarios());
    if (filterNivelAcesso) filterNivelAcesso.addEventListener('change', () => renderUsuarios());
    if (btnResetAcessos) {
        btnResetAcessos.addEventListener('click', () => {
            if (inputBuscarUsuario) inputBuscarUsuario.value = '';
            if (filterNivelAcesso) filterNivelAcesso.value = '';
            if (typeof syncCustomFilterDropdowns === 'function') {
                syncCustomFilterDropdowns();
            }
            renderUsuarios();
        });
    }

    function renderUsuarios() {
        const tbody = document.getElementById('acessosTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const searchQuery = (document.getElementById('inputBuscarUsuario')?.value || '').toLowerCase();
        const nivelQuery = document.getElementById('filterNivelAcesso')?.value || '';

        let filtered = usuarios ? usuarios.filter(u => {
            if (!u) return false;
            const matchSearch = !searchQuery ||
                (u.nome && u.nome.toLowerCase().includes(searchQuery)) ||
                (u.email && u.email.toLowerCase().includes(searchQuery)) ||
                (u.nivel && u.nivel.toLowerCase().includes(searchQuery));
            const matchNivel = !nivelQuery || u.nivel === nivelQuery;
            return matchSearch && matchNivel;
        }) : [];

        if (filtered.length === 0) {
            const emptyTr = document.createElement('tr');
            emptyTr.className = 'empty-state-row';
            emptyTr.innerHTML = `
                <td colspan="4" class="empty-state-cell">
                    <i class="ph ph-magnifying-glass"></i>
                    <span>Nenhum usuário encontrado.</span>
                </td>
            `;
            tbody.appendChild(emptyTr);
            renderPagination('paginationAcessosContainer', 'acessos', 0, 10, renderUsuarios);
            return;
        }

        const limit = (personalConfig && personalConfig.limiteLinhas && personalConfig.limiteLinhas.acessos)
            ? parseInt(personalConfig.limiteLinhas.acessos, 10)
            : ((configuracoes && configuracoes.limiteLinhas && configuracoes.limiteLinhas.acessos) ? parseInt(configuracoes.limiteLinhas.acessos, 10) : 10);
        const totalPages = Math.ceil(filtered.length / limit) || 1;
        if (paginationState.acessos > totalPages) paginationState.acessos = totalPages;
        const start = (paginationState.acessos - 1) * limit;
        const pagedUsuarios = filtered.slice(start, start + limit);

        pagedUsuarios.forEach(user => {
            const tr = document.createElement('tr');

            let badgeClass = 'badge-viewer';
            if (user.nivel === 'Master') badgeClass = 'badge-master';
            if (user.nivel === 'Administrador') badgeClass = 'badge-admin';
            if (user.nivel === 'Editor') badgeClass = 'badge-editor';

            const readOnlyAcessos = isPageReadOnly('acessos');
            const actionsTdHtml = readOnlyAcessos ? '' : `
                <td style="text-align: center; white-space: nowrap; width: 1%;">
                    <div style="display: inline-flex; gap: 4px; justify-content: center; align-items: center;">
                        <button class="action-btn edit" onclick="window.openEditUsuario('${user.id}')" title="Editar"><i class="ph ph-pencil-simple"></i></button>
                        <button class="action-btn delete" onclick="window.openDeleteUsuarioModal('${user.id}')" title="Excluir"><i class="ph ph-trash"></i></button>
                    </div>
                </td>
            `;

            tr.innerHTML = `
                <td><strong>${user.nome}</strong></td>
                <td>${user.email}</td>
                <td><span class="badge ${badgeClass}">${user.nivel}</span></td>
                ${actionsTdHtml}
            `;
            tbody.appendChild(tr);
        });
        renderPagination('paginationAcessosContainer', 'acessos', filtered.length, limit, renderUsuarios);
    };

    window.openEditUsuario = (id) => {
        openUsuarioModal(id);
    };

    // --- LÓGICA DO GERENCIADOR DE NÍVEIS DE ACESSO ---
    const btnGerenciarNiveisAcesso = document.getElementById('btnGerenciarNiveisAcesso');
    const modalGerenciarNiveisAcesso = document.getElementById('modalGerenciarNiveisAcesso');
    const closeModalGerenciarNiveisAcesso = document.getElementById('closeModalGerenciarNiveisAcesso');
    const btnAdicionarNivelAcesso = document.getElementById('btnAdicionarNivelAcesso');
    const inputNovoNivelAcesso = document.getElementById('inputNovoNivelAcesso');

    const renderNiveisAcessoTable = () => {
        const niveisAcessoTableBody = document.getElementById('niveisAcessoTableBody');
        if (!niveisAcessoTableBody) return;
        niveisAcessoTableBody.innerHTML = '';
        const niveisList = ensureNiveisAcesso();

        if (niveisList.length === 0) {
            niveisAcessoTableBody.innerHTML = '<tr><td colspan="3" class="text-center" style="padding: 20px;">Nenhum nível de acesso cadastrado.</td></tr>';
            renderPagination('paginationNiveisAcessoContainer', 'niveisAcesso', 0, 15, renderNiveisAcessoTable);
            return;
        }

        const limit = 15;
        const totalPages = Math.ceil(niveisList.length / limit) || 1;
        if (!paginationState.niveisAcesso || isNaN(paginationState.niveisAcesso) || paginationState.niveisAcesso < 1) {
            paginationState.niveisAcesso = 1;
        }
        if (paginationState.niveisAcesso > totalPages) paginationState.niveisAcesso = totalPages;
        const start = (paginationState.niveisAcesso - 1) * limit;
        const pagedNiveis = niveisList.slice(start, start + limit);

        pagedNiveis.forEach((nivel, index) => {
            const tr = document.createElement('tr');
            const actionIndex = start + index;
            const count = usuarios ? usuarios.filter(u => u && u.nivel === nivel).length : 0;

            tr.innerHTML = `
                <td style="word-break: break-word; overflow-wrap: anywhere; word-wrap: break-word; line-height: 1.4; padding: 10px 14px;"><strong>${nivel}</strong></td>
                <td style="text-align: center; white-space: nowrap;"><span class="count-badge" style="background: rgba(139, 92, 246, 0.15); color: #c4b5fd; border: 1px solid rgba(139, 92, 246, 0.3); padding: 2px 10px; border-radius: 12px; font-weight: 600; font-size: 13px;">${count}</span></td>
                <td style="text-align: center; white-space: nowrap;">
                    <div style="display: inline-flex; gap: 4px; justify-content: center;">
                        <button class="group-action-btn edit-btn" onclick="window.editarNivelAcesso(${actionIndex})" title="Editar"><i class="ph ph-pencil-simple"></i></button>
                        <button class="group-action-btn delete-btn" onclick="window.deletarNivelAcesso(${actionIndex})" title="Excluir"><i class="ph ph-trash"></i></button>
                    </div>
                </td>
            `;
            niveisAcessoTableBody.appendChild(tr);
        });
        renderPagination('paginationNiveisAcessoContainer', 'niveisAcesso', niveisList.length, limit, renderNiveisAcessoTable);
    };
    window.renderNiveisAcessoTable = renderNiveisAcessoTable;

    if (btnGerenciarNiveisAcesso) {
        btnGerenciarNiveisAcesso.addEventListener('click', () => {
            renderNiveisAcessoTable();
            modalGerenciarNiveisAcesso.classList.add('active');
        });
    }

    if (closeModalGerenciarNiveisAcesso) {
        closeModalGerenciarNiveisAcesso.addEventListener('click', () => {
            modalGerenciarNiveisAcesso.classList.remove('active');
        });
    }

    function renderPermissoesTable(nivel) {
        const tbody = document.getElementById('permissoesTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const currentPerms = getPermissoesForNivel(nivel);

        appPagesList.forEach(p => {
            const perm = currentPerms[p.key] || { acesso: p.defaultChecked, apenasVisualizar: false };
            const tr = document.createElement('tr');

            tr.innerHTML = `
                <td style="padding: 10px 14px; color: var(--text-main); font-weight: 500; vertical-align: middle;">${p.label}</td>
                <td style="text-align: center; vertical-align: middle; padding: 10px 14px;">
                    <div style="display: flex; align-items: center; justify-content: center;">
                        <input type="checkbox" class="cb-perm-acesso" data-page="${p.key}" ${perm.acesso ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: #8b5cf6; cursor: pointer; margin: 0;">
                    </div>
                </td>
                <td style="text-align: center; vertical-align: middle; padding: 10px 14px;">
                    <div style="display: flex; align-items: center; justify-content: center;">
                        <input type="checkbox" class="cb-perm-vis" data-page="${p.key}" ${perm.apenasVisualizar ? 'checked' : ''} ${!perm.acesso ? 'disabled' : ''} style="width: 18px; height: 18px; accent-color: #8b5cf6; cursor: pointer; margin: 0;">
                    </div>
                </td>
            `;

            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.cb-perm-acesso').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const pageKey = e.target.getAttribute('data-page');
                const visCb = tbody.querySelector(`.cb-perm-vis[data-page="${pageKey}"]`);
                if (visCb) {
                    if (e.target.checked) {
                        visCb.disabled = false;
                    } else {
                        visCb.checked = false;
                        visCb.disabled = true;
                    }
                }
            });
        });
    }

    if (btnAdicionarNivelAcesso) {
        btnAdicionarNivelAcesso.addEventListener('click', async () => {
            const novoNivel = inputNovoNivelAcesso.value.trim();
            if (!novoNivel) return;

            if (!configuracoes.niveisAcesso) configuracoes.niveisAcesso = ['Master', 'Editor', 'Visualizador'];
            if (configuracoes.niveisAcesso.includes(novoNivel)) {
                showToast('Este nível de acesso já existe', 'error');
                return;
            }

            configuracoes.niveisAcesso.push(novoNivel);
            getPermissoesForNivel(novoNivel);

            try {
                btnAdicionarNivelAcesso.disabled = true;
                const { error } = await supabaseClient.from('configuracoes').upsert([{ id: 'geral', dados: configuracoes }]);

                if (error) throw error;

                inputNovoNivelAcesso.value = '';
                renderNiveisAcessoTable();
                updateNivelAcessoFilterOptions();
                renderUsuarios();
                showToast('Nível de acesso adicionado com sucesso', 'success');
                if (typeof playSuccessSound === 'function') playSuccessSound();
            } catch (err) {
                console.error(err);
                showToast('Erro ao adicionar nível de acesso', 'error');
                configuracoes.niveisAcesso.pop();
                if (configuracoes.permissoes) delete configuracoes.permissoes[novoNivel];
            } finally {
                btnAdicionarNivelAcesso.disabled = false;
            }
        });
    }

    // Modal de Edição/Exclusão de Nível de Acesso
    const closeEdNivel = () => document.getElementById('modalEditarNivelAcesso').classList.remove('active');
    const closeExNivel = () => document.getElementById('modalExcluirNivelAcesso').classList.remove('active');
    document.getElementById('btnCloseEditarNivelAcesso')?.addEventListener('click', closeEdNivel);
    document.getElementById('btnCancelEditarNivelAcesso')?.addEventListener('click', closeEdNivel);
    document.getElementById('btnCloseExcluirNivelAcesso')?.addEventListener('click', closeExNivel);
    document.getElementById('btnCancelExcluirNivelAcesso')?.addEventListener('click', closeExNivel);

    window.deletarNivelAcesso = (index) => {
        const oldValue = configuracoes.niveisAcesso[index];
        const modal = document.getElementById('modalExcluirNivelAcesso');
        const textExcluir = document.getElementById('textExcluirNivelAcesso');
        const btnConfirm = document.getElementById('btnConfirmExcluirNivelAcesso');

        if (!modal || !textExcluir || !btnConfirm || !oldValue) return;

        textExcluir.textContent = `Tem certeza que deseja excluir o nível de acesso "${oldValue}"?`;

        const newBtnConfirm = btnConfirm.cloneNode(true);
        btnConfirm.parentNode.replaceChild(newBtnConfirm, btnConfirm);

        newBtnConfirm.addEventListener('click', async () => {
            configuracoes.niveisAcesso.splice(index, 1);
            if (configuracoes.permissoes) delete configuracoes.permissoes[oldValue];

            try {
                newBtnConfirm.disabled = true;
                newBtnConfirm.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';

                const { error } = await supabaseClient.from('configuracoes').upsert([{ id: 'geral', dados: configuracoes }]);
                if (error) throw error;

                if (oldValue && typeof oldValue === 'string' && oldValue.trim() !== '') {
                    const { error: cascadeErr } = await supabaseClient
                        .from('usuarios')
                        .update({ nivel: 'Sem nível' })
                        .eq('nivel', oldValue);

                    if (cascadeErr) {
                        console.error("Erro ao reatribuir usuários:", cascadeErr);
                    }
                    if (usuarios) {
                        usuarios.forEach(u => {
                            if (u && u.nivel === oldValue) u.nivel = 'Sem nível';
                        });
                    }
                }

                renderNiveisAcessoTable();
                updateNivelAcessoFilterOptions();
                renderUsuarios();
                showToast('Nível de acesso excluído com sucesso', 'success');
                if (typeof playSuccessSound === 'function') playSuccessSound();
                modal.classList.remove('active');
            } catch (err) {
                console.error(err);
                showToast('Erro ao excluir nível de acesso', 'error');
                configuracoes.niveisAcesso.splice(index, 0, oldValue);
            } finally {
                newBtnConfirm.disabled = false;
                newBtnConfirm.textContent = 'Excluir';
            }
        });

        modal.classList.add('active');
    };

    window.editarNivelAcesso = (index) => {
        const oldValue = configuracoes.niveisAcesso[index];
        const modal = document.getElementById('modalEditarNivelAcesso');
        const inputNome = document.getElementById('inputEditarNomeNivelAcesso');
        const btnSave = document.getElementById('btnSaveEditarNivelAcesso');

        if (!modal || !inputNome || !btnSave || !oldValue) return;

        inputNome.value = oldValue;
        renderPermissoesTable(oldValue);

        const newBtnSave = btnSave.cloneNode(true);
        btnSave.parentNode.replaceChild(newBtnSave, btnSave);

        newBtnSave.addEventListener('click', async () => {
            const novoNome = inputNome.value.trim();
            if (!novoNome) {
                showToast('Digite o nome do nível de acesso', 'warning');
                return;
            }

            if (novoNome !== oldValue && configuracoes.niveisAcesso.includes(novoNome)) {
                showToast('Este nível de acesso já existe', 'error');
                return;
            }

            const updatedPerms = {};
            appPagesList.forEach(p => {
                const cbAcesso = document.querySelector(`.cb-perm-acesso[data-page="${p.key}"]`);
                const cbVis = document.querySelector(`.cb-perm-vis[data-page="${p.key}"]`);
                updatedPerms[p.key] = {
                    acesso: cbAcesso ? cbAcesso.checked : false,
                    apenasVisualizar: cbVis ? cbVis.checked : false
                };
            });

            if (!configuracoes.permissoes) configuracoes.permissoes = {};
            if (oldValue !== novoNome) {
                delete configuracoes.permissoes[oldValue];
                configuracoes.niveisAcesso[index] = novoNome;
            }
            configuracoes.permissoes[novoNome] = updatedPerms;

            try {
                newBtnSave.disabled = true;
                newBtnSave.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';

                const { error } = await supabaseClient.from('configuracoes').upsert([{ id: 'geral', dados: configuracoes }]);
                if (error) throw error;

                if (oldValue && oldValue !== novoNome && typeof oldValue === 'string' && oldValue.trim() !== '') {
                    const { error: cascadeErr } = await supabaseClient
                        .from('usuarios')
                        .update({ nivel: novoNome })
                        .eq('nivel', oldValue);

                    if (cascadeErr) {
                        console.error("Erro na atualização em cascata dos usuários:", cascadeErr);
                    }
                    if (usuarios) {
                        usuarios.forEach(u => {
                            if (u && u.nivel === oldValue) u.nivel = novoNome;
                        });
                    }
                }

                renderNiveisAcessoTable();
                updateNivelAcessoFilterOptions();
                renderUsuarios();
                applyRBAC();
                renderTables();
                showToast('Nível de acesso atualizado com sucesso', 'success');
                if (typeof playSuccessSound === 'function') playSuccessSound();
                modal.classList.remove('active');
            } catch (err) {
                console.error(err);
                showToast('Erro ao atualizar nível de acesso', 'error');
                configuracoes.niveisAcesso[index] = oldValue;
            } finally {
                newBtnSave.disabled = false;
                newBtnSave.textContent = 'Salvar';
            }
        });

        modal.classList.add('active');
    };

    // ==========================================
    // ==========================================

    const fetchGuias = async () => {
        const { data } = await supabaseClient.from('guias').select('*');
        if (data) {
            guias = data;
            ensureGuiaTipos();
            updateGuiaFilterOptions();
            if (currentPage === 'ajuda') renderGuias();
        }
    };
    fetchGuias();
    supabaseClient.channel('guias_channel').on('postgres_changes', { event: '*', schema: 'public', table: 'guias' }, fetchGuias).subscribe();

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

    let lastGuiaEnterTime = 0;
    let tsGuiaTipo = null;

    function renderGuiaTipoSelectOptions(selectedVal = '') {
        const sel = document.getElementById('inputGuiaTipoSelect');
        if (!sel) return;
        if (tsGuiaTipo) {
            tsGuiaTipo.destroy();
            tsGuiaTipo = null;
        }
        const tiposList = ensureGuiaTipos();
        sel.innerHTML = '<option value="">Selecione o Grupo</option>';
        tiposList.forEach(t => {
            sel.innerHTML += `<option value="${t}">${t}</option>`;
        });
        sel.value = selectedVal;
        tsGuiaTipo = new TomSelect('#inputGuiaTipoSelect', {
            create: false,
            sortField: { field: "text", direction: "asc" },
            maxOptions: null,
            allowEmptyOption: false,
            placeholder: "Selecione o Grupo",
            onItemAdd: function (val) {
                this.setTextboxValue('');
                this.refreshOptions(false);
                this.blur();
            },
            onChange: function () {
                this.setTextboxValue('');
                this.refreshOptions(false);
                this.blur();
            },
            onBlur: function () {
                this.setTextboxValue('');
                this.refreshOptions(false);
            }
        });
        if (selectedVal) {
            tsGuiaTipo.setValue(selectedVal);
        }
    }

    function getFirstMissingRequiredGuiaField() {
        const sequence = [
            { id: 'inputGuiaTitulo', label: 'Título / Nome' },
            { id: 'inputGuiaTipoSelect', label: 'Grupo', getInst: () => tsGuiaTipo },
            { id: 'inputGuiaConteudo', label: 'Descrição' }
        ];

        for (const item of sequence) {
            let val = '';
            if (item.getInst) {
                const inst = item.getInst();
                if (inst && typeof inst.getValue === 'function') {
                    val = inst.getValue();
                }
            }
            if (!val) {
                const el = document.getElementById(item.id);
                if (el) {
                    val = el.value;
                }
            }
            val = (val || '').trim();
            if (!val) {
                return item;
            }
        }
        return null;
    }

    function focusGuiaField(item) {
        if (!item) return;
        if (item.getInst) {
            const inst = item.getInst();
            if (inst && typeof inst.focus === 'function') {
                inst.focus();
                return;
            }
        }
        const el = document.getElementById(item.id);
        if (el) {
            el.focus();
            if (typeof el.select === 'function') el.select();
        }
    }

    window.closeModal = function(modalId) {
        if (!modalId) return;
        const m = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
        if (m) m.classList.remove('active');
    };

    function renderExcelWorkbook(workbook, bodyEl) {
        bodyEl.innerHTML = '';
        const container = document.createElement('div');
        container.style.cssText = 'width: 100%; height: 100%; max-height: 70vh; display: flex; flex-direction: column; gap: 12px;';

        if (workbook.SheetNames && workbook.SheetNames.length > 1) {
            const tabsBar = document.createElement('div');
            tabsBar.style.cssText = 'display: flex; gap: 6px; overflow-x: auto; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.1);';

            workbook.SheetNames.forEach((sheetName, index) => {
                const btnTab = document.createElement('button');
                btnTab.type = 'button';
                btnTab.textContent = sheetName;
                btnTab.style.cssText = `padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid rgba(139,92,246,0.3); ${index === 0 ? 'background: #6d28d9; color: #ffffff;' : 'background: rgba(255,255,255,0.05); color: #c4b5fd;'}`;
                btnTab.onclick = () => {
                    tabsBar.querySelectorAll('button').forEach(b => {
                        b.style.background = 'rgba(255,255,255,0.05)';
                        b.style.color = '#c4b5fd';
                    });
                    btnTab.style.background = '#6d28d9';
                    btnTab.style.color = '#ffffff';
                    showSheet(sheetName);
                };
                tabsBar.appendChild(btnTab);
            });
            container.appendChild(tabsBar);
        }

        const tableWrapper = document.createElement('div');
        tableWrapper.style.cssText = 'flex: 1; overflow: auto; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; background: #13111c; padding: 4px;';

        function showSheet(sheetName) {
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) return;
            const htmlString = typeof XLSX !== 'undefined' ? XLSX.utils.sheet_to_html(sheet) : '';
            tableWrapper.innerHTML = htmlString;

            const table = tableWrapper.querySelector('table');
            if (table) {
                table.style.cssText = 'width: 100%; border-collapse: collapse; font-size: 13px; color: #f1f5f9; text-align: left;';
                table.querySelectorAll('tr').forEach((tr, rIdx) => {
                    tr.style.borderBottom = '1px solid rgba(255,255,255,0.06)';
                    if (rIdx === 0) tr.style.background = 'rgba(109, 40, 217, 0.3)';
                });
                table.querySelectorAll('th, td').forEach(cell => {
                    cell.style.padding = '8px 12px';
                    cell.style.border = '1px solid rgba(255,255,255,0.08)';
                });
            }
        }

        showSheet(workbook.SheetNames[0]);
        container.appendChild(tableWrapper);
        bodyEl.appendChild(container);
    }

    function renderFallbackPreview(bodyEl, message) {
        bodyEl.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #cbd5e1; display: flex; flex-direction: column; align-items: center; gap: 12px;">
                <i class="ph ph-file-text" style="font-size: 54px; color: #8b5cf6;"></i>
                <p style="font-size: 15px; margin: 0; font-weight: 600;">${message}</p>
                <p style="font-size: 13px; margin: 0; color: #94a3b8;">Clique no botão "Baixar Arquivo" para abrir em seu dispositivo.</p>
            </div>
        `;
    }

    window.abrirPreviewAnexo = (title, src, typeHint) => {
        const modal = document.getElementById('modalPreviewAnexo');
        const titleEl = document.getElementById('previewAnexoTitulo');
        const bodyEl = document.getElementById('previewAnexoBody');
        const btnDownload = document.getElementById('btnDownloadPreviewAnexo');
        const btnClose = document.getElementById('btnClosePreviewAnexo');
        const btnFechar = document.getElementById('btnFecharPreviewAnexo');

        if (!modal || !bodyEl) return;

        if (btnClose) btnClose.onclick = () => window.closeModal('modalPreviewAnexo');
        if (btnFechar) btnFechar.onclick = () => window.closeModal('modalPreviewAnexo');

        titleEl.innerHTML = `<i class="ph ph-file-magnifying-glass" style="color: #8b5cf6;"></i> ${title || 'Visualizar Anexo'}`;

        if (btnDownload) {
            btnDownload.onclick = () => {
                const a = document.createElement('a');
                a.href = src || '#';
                if (title) a.download = title;
                a.target = '_blank';
                a.click();
            };
        }

        bodyEl.innerHTML = '';

        const ext = (title || '').split('.').pop().toLowerCase();
        const isExcel = ['xls', 'xlsx', 'csv', 'ods', 'tsv'].includes(ext) || 
                        (typeof src === 'string' && (src.includes('spreadsheet') || src.includes('excel') || src.includes('csv')));
        const isImg = typeHint === 'image' || (typeof src === 'string' && (src.startsWith('data:image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(src) || /\.(png|jpe?g|webp|gif|svg)/i.test(title || '')));
        const isPdf = typeHint === 'pdf' || (typeof src === 'string' && (src.startsWith('data:application/pdf') || /\.pdf$/i.test(src) || /\.pdf/i.test(title || '')));

        if (isExcel && typeof XLSX !== 'undefined') {
            try {
                let workbook = null;
                if (typeof src === 'string' && src.startsWith('data:')) {
                    const parts = src.split(',');
                    const mime = parts[0];
                    const base64Data = parts[1];

                    if (mime.includes('csv') || ext === 'csv') {
                        const decodedText = atob(base64Data);
                        workbook = XLSX.read(decodedText, { type: 'string' });
                    } else {
                        workbook = XLSX.read(base64Data, { type: 'base64' });
                    }
                } else if (typeof src === 'string' && (src.startsWith('http://') || src.startsWith('https://'))) {
                    bodyEl.innerHTML = '<div style="color: #a78bfa; padding: 20px;"><i class="ph ph-spinner spinner" style="font-size: 24px;"></i> Carregando planilha...</div>';
                    fetch(src)
                        .then(res => res.arrayBuffer())
                        .then(buffer => {
                            const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
                            renderExcelWorkbook(wb, bodyEl);
                        })
                        .catch(err => {
                            console.error('Erro ao carregar planilha remota:', err);
                            renderFallbackPreview(bodyEl, 'Erro ao carregar planilha remota.');
                        });
                    modal.classList.add('active');
                    return;
                }

                if (workbook && workbook.SheetNames && workbook.SheetNames.length > 0) {
                    renderExcelWorkbook(workbook, bodyEl);
                } else {
                    renderFallbackPreview(bodyEl, 'Formato de planilha não reconhecido.');
                }
            } catch (err) {
                console.error('Erro ao ler planilha com SheetJS:', err);
                renderFallbackPreview(bodyEl, 'Não foi possível ler a planilha automaticamente.');
            }
        } else if (isImg) {
            const img = document.createElement('img');
            img.src = src;
            img.alt = title || 'Anexo';
            img.style.cssText = 'max-width: 100%; max-height: 70vh; object-fit: contain; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.5);';
            bodyEl.appendChild(img);
        } else if (isPdf) {
            const iframe = document.createElement('iframe');
            iframe.src = src;
            iframe.style.cssText = 'width: 100%; height: 70vh; border: none; border-radius: 8px; background: #ffffff;';
            bodyEl.appendChild(iframe);
        } else if (typeof src === 'string' && src.startsWith('data:text/')) {
            const pre = document.createElement('pre');
            pre.style.cssText = 'white-space: pre-wrap; font-family: monospace; font-size: 13px; color: #e2e8f0; background: rgba(0,0,0,0.4); padding: 16px; border-radius: 8px; width: 100%; max-height: 70vh; overflow-y: auto;';
            try {
                pre.textContent = atob(src.split(',')[1] || '');
            } catch (_) {
                pre.textContent = src;
            }
            bodyEl.appendChild(pre);
        } else {
            renderFallbackPreview(bodyEl, 'Visualização no site não disponível para este formato.');
        }

        modal.classList.add('active');
    };

    let guiaAnexosArray = [];

    function renderListaAnexosGuia() {
        const container = document.getElementById('listaAnexosGuiaCards');
        const badge = document.getElementById('sidePanelAnexosBadge');
        const inputHidden = document.getElementById('inputGuiaAnexo');
        if (!container) return;

        container.innerHTML = '';
        if (badge) badge.textContent = guiaAnexosArray.length;

        if (guiaAnexosArray.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 30px 15px; color: #94a3b8; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.08); border-radius: 8px; display: flex; flex-direction: column; align-items: center; gap: 8px;">
                    <i class="ph ph-files" style="font-size: 32px; color: #8b5cf6; opacity: 0.7;"></i>
                    <span style="font-size: 13px; font-weight: 500;">Nenhum anexo adicionado ainda.</span>
                    <span style="font-size: 11px; opacity: 0.7;">Clique em "Anexar arquivo" para adicionar.</span>
                </div>
            `;
        } else {
            guiaAnexosArray.forEach((item, index) => {
                const isImage = (item.type && item.type.startsWith('image/')) ||
                                (item.data && typeof item.data === 'string' && item.data.startsWith('data:image/')) ||
                                (item.name && /\.(png|jpe?g|webp|gif|svg)$/i.test(item.name)) ||
                                (item.url && /\.(png|jpe?g|webp|gif|svg)$/i.test(item.url));

                const isPdf = (item.type && item.type.includes('pdf')) ||
                              (item.data && typeof item.data === 'string' && item.data.startsWith('data:application/pdf')) ||
                              (item.name && /\.pdf$/i.test(item.name)) ||
                              (item.url && /\.pdf$/i.test(item.url));

                const isExcel = (item.name && /\.(xlsx?|csv|ods|tsv)$/i.test(item.name)) ||
                                (item.url && /\.(xlsx?|csv|ods|tsv)$/i.test(item.url));

                const card = document.createElement('div');
                card.style.cssText = 'background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(139, 92, 246, 0.25); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 10px; transition: all 0.2s ease;';

                let previewHtml = '';
                const fileSrc = item.data || item.url || '#';
                const fileName = item.name || item.url || `Anexo ${index + 1}`;

                if (isImage) {
                    previewHtml = `
                        <div style="height: 110px; width: 100%; border-radius: 8px; overflow: hidden; background: #0f0d1b; border: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; cursor: pointer; position: relative;">
                            <img src="${fileSrc}" alt="${fileName}" style="width: 100%; height: 100%; object-fit: cover;">
                        </div>
                    `;
                } else if (isPdf) {
                    previewHtml = `
                        <div style="height: 80px; width: 100%; border-radius: 8px; background: rgba(239, 68, 68, 0.1); border: 1px dashed rgba(239, 68, 68, 0.3); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: #fca5a5; cursor: pointer;">
                            <i class="ph ph-file-pdf" style="font-size: 28px; color: #ef4444;"></i>
                            <span style="font-size: 11px; font-weight: 600; text-transform: uppercase;">Documento PDF</span>
                        </div>
                    `;
                } else if (isExcel) {
                    previewHtml = `
                        <div style="height: 80px; width: 100%; border-radius: 8px; background: rgba(16, 185, 129, 0.1); border: 1px dashed rgba(16, 185, 129, 0.3); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: #6ee7b7; cursor: pointer;">
                            <i class="ph ph-file-xls" style="font-size: 28px; color: #10b981;"></i>
                            <span style="font-size: 11px; font-weight: 600; text-transform: uppercase;">Planilha Excel</span>
                        </div>
                    `;
                } else {
                    const ext = (fileName.split('.').pop() || 'file').toUpperCase();
                    previewHtml = `
                        <div style="height: 75px; width: 100%; border-radius: 8px; background: rgba(139, 92, 246, 0.1); border: 1px dashed rgba(139, 92, 246, 0.3); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: #a78bfa;">
                            <i class="ph ph-file-text" style="font-size: 26px;"></i>
                            <span style="font-size: 11px; font-weight: 600;">${ext}</span>
                        </div>
                    `;
                }

                card.innerHTML = `
                    ${previewHtml}
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                        <span style="font-size: 13px; font-weight: 600; color: #f1f5f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;" title="${fileName}">${fileName}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;">
                        <button type="button" class="btn-preview-card" title="Visualizar no site" style="flex: 1; height: 36px; padding: 0; background: rgba(109, 40, 217, 0.25); border: 1px solid rgba(139, 92, 246, 0.4); color: #c4b5fd; border-radius: 6px; font-size: 16px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s;">
                            <i class="ph ph-eye"></i>
                        </button>
                        <a href="${fileSrc}" ${fileName ? `download="${fileName}"` : ''} target="_blank" title="Baixar arquivo" style="flex: 1; height: 36px; padding: 0; background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.4); color: #93c5fd; border-radius: 6px; font-size: 16px; text-decoration: none; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s;">
                            <i class="ph ph-download-simple"></i>
                        </a>
                        <button type="button" class="btn-remove-card" title="Excluir anexo" style="flex: 1; height: 36px; padding: 0; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5; border-radius: 6px; font-size: 16px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s;">
                            <i class="ph ph-trash"></i>
                        </button>
                    </div>
                `;

                const btnPrev = card.querySelector('.btn-preview-card');
                if (btnPrev) {
                    btnPrev.onclick = () => abrirPreviewAnexo(fileName, fileSrc, isImage ? 'image' : (isPdf ? 'pdf' : (isExcel ? 'excel' : 'other')));
                }

                const btnRem = card.querySelector('.btn-remove-card');
                if (btnRem) {
                    btnRem.onclick = () => {
                        guiaAnexosArray.splice(index, 1);
                        renderListaAnexosGuia();
                    };
                }

                container.appendChild(card);
            });
        }

        if (inputHidden) {
            inputHidden.value = guiaAnexosArray.length > 0 ? JSON.stringify(guiaAnexosArray) : '';
        }
    }

    const btnAnexarGuia = document.getElementById('btnAnexarArquivoGuia');
    const inputGuiaFile = document.getElementById('inputGuiaFile');
    if (btnAnexarGuia && inputGuiaFile) {
        btnAnexarGuia.addEventListener('click', () => {
            inputGuiaFile.click();
        });

        inputGuiaFile.addEventListener('change', (e) => {
            const files = Array.from(e.target.files || []);
            if (!files.length) return;

            files.forEach(file => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    guiaAnexosArray.push({
                        name: file.name,
                        type: file.type,
                        data: event.target.result
                    });
                    renderListaAnexosGuia();
                };
                reader.readAsDataURL(file);
            });
            inputGuiaFile.value = '';
        });
    }

    const openGuiaModal = (editId = null) => {
        currentEditGuiaId = editId;
        lastGuiaEnterTime = 0;

        if (editId) {
            const g = guias.find(x => x.id === editId);
            document.getElementById('inputGuiaTitulo').value = g.titulo || '';
            renderGuiaTipoSelectOptions(g.tipo || '');
            document.getElementById('inputGuiaConteudo').value = g.conteudo || '';
            
            guiaAnexosArray = [];
            if (g.anexo) {
                try {
                    const parsed = JSON.parse(g.anexo);
                    if (Array.isArray(parsed)) {
                        guiaAnexosArray = parsed;
                    } else if (typeof parsed === 'object' && parsed !== null) {
                        guiaAnexosArray = [parsed];
                    } else {
                        guiaAnexosArray = [{ name: String(g.anexo), url: String(g.anexo) }];
                    }
                } catch (_) {
                    guiaAnexosArray = [{ name: String(g.anexo), url: String(g.anexo) }];
                }
            }
            renderListaAnexosGuia();

            document.querySelector('#modalNovaGuiaTitle').textContent = "Editar tutorial";
            document.querySelector('#formNovaGuia .btn-submit').textContent = "Salvar";
        } else {
            formNovaGuia.reset();
            renderGuiaTipoSelectOptions('');
            guiaAnexosArray = [];
            renderListaAnexosGuia();
            document.querySelector('#modalNovaGuiaTitle').textContent = "Criar novo tutorial";
            document.querySelector('#formNovaGuia .btn-submit').textContent = "Criar";
        }

        modalNovaGuia.classList.add('active');
    };

    if (btnNovoGuia) btnNovoGuia.addEventListener('click', () => openGuiaModal(null));
    if (btnCloseGuia) btnCloseGuia.addEventListener('click', () => modalNovaGuia.classList.remove('active'));
    if (btnCancelGuia) btnCancelGuia.addEventListener('click', () => modalNovaGuia.classList.remove('active'));

    if (formNovaGuia) {
        formNovaGuia.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (e.target.tagName === 'TEXTAREA' && e.shiftKey) return;
                if (!modalNovaGuia || !modalNovaGuia.classList.contains('active')) return;

                e.preventDefault();

                const now = Date.now();
                if (now - lastGuiaEnterTime < 1500) {
                    return;
                }
                lastGuiaEnterTime = now;

                const missing = getFirstMissingRequiredGuiaField();
                if (missing) {
                    showToast(`Preencha o campo "${missing.label}".`, 'warning');
                    focusGuiaField(missing);
                } else {
                    if (document.activeElement && typeof document.activeElement.blur === 'function') {
                        document.activeElement.blur();
                    }
                    formNovaGuia.requestSubmit();
                }
            }
        });

        formNovaGuia.addEventListener('submit', async (e) => {
            e.preventDefault();

            const missing = getFirstMissingRequiredGuiaField();
            if (missing) {
                showToast(`Preencha o campo "${missing.label}".`, 'warning');
                focusGuiaField(missing);
                return;
            }

            const btnSubmit = formNovaGuia.querySelector('.btn-submit');
            btnSubmit.disabled = true;

            try {
                // Creating/Editing Caminho
                const dataObj = {
                    titulo: document.getElementById('inputGuiaTitulo').value.trim(),
                    tipo: (tsGuiaTipo ? tsGuiaTipo.getValue() : inputGuiaTipoSelect.value).trim(),
                    conteudo: document.getElementById('inputGuiaConteudo').value.trim(),
                    anexo: document.getElementById('inputGuiaAnexo').value.trim(),
                    dataAtualizacao: Date.now()
                };

                if (currentEditGuiaId) {
                    await supabaseClient.from("guias").update(dataObj).eq("id", currentEditGuiaId);
                    showToast("Tutorial atualizado com sucesso!", "success");
                    if (typeof playSuccessSound === 'function') playSuccessSound();
                } else {
                    const currentUser = usuarios.find(u => u.email === loggedUser.email);
                    dataObj.autor = currentUser ? currentUser.nome : loggedUser.email;
                    dataObj.dataCriacao = Date.now();
                    await supabaseClient.from("guias").insert([dataObj]);
                    showToast("Tutorial criado com sucesso!", "success");
                    if (typeof playSuccessSound === 'function') playSuccessSound();
                }

                modalNovaGuia.classList.remove('active');
                renderGuias();
            } catch (err) {
                console.error("Erro ao salvar tutorial:", err);
                showToast(`Erro ao salvar tutorial.. Detalhe: ${(typeof error !== "undefined" && error) ? error.message : "Desconhecido"}`, "error");
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
        filterGuiaTipo.innerHTML = '<option value="">Grupo</option>';

        const typesList = ensureGuiaTipos();

        typesList.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t; opt.textContent = t;
            if (t === currentVal) opt.selected = true;
            filterGuiaTipo.appendChild(opt);
        });

        if (typeof syncCustomFilterDropdowns === 'function') {
            syncCustomFilterDropdowns();
        }
    };
    window.updateGuiaFilterOptions = updateGuiaFilterOptions;

    if (inputBuscarGuia) inputBuscarGuia.addEventListener('input', () => renderGuias());
    if (filterGuiaTipo) filterGuiaTipo.addEventListener('change', () => renderGuias());
    if (btnResetGuia) {
        btnResetGuia.addEventListener('click', () => {
            inputBuscarGuia.value = '';
            filterGuiaTipo.value = '';
            if (typeof syncCustomFilterDropdowns === 'function') {
                syncCustomFilterDropdowns();
            }
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

        const sidePanel = document.getElementById('sidePanelAnexosViewGuia');
        const containerCards = document.getElementById('listaAnexosViewGuiaCards');
        const badgeView = document.getElementById('sidePanelAnexosViewBadge');
        
        let attachmentsList = [];
        if (g.anexo) {
            try {
                const parsed = JSON.parse(g.anexo);
                if (Array.isArray(parsed)) attachmentsList = parsed;
                else if (typeof parsed === 'object' && parsed !== null) attachmentsList = [parsed];
                else attachmentsList = [{ name: String(g.anexo), url: String(g.anexo) }];
            } catch (_) {
                attachmentsList = [{ name: String(g.anexo), url: String(g.anexo) }];
            }
        }

        if (attachmentsList.length > 0) {
            if (sidePanel) sidePanel.style.display = 'flex';
            if (badgeView) badgeView.textContent = attachmentsList.length;
            if (containerCards) {
                containerCards.innerHTML = '';
                attachmentsList.forEach((item, index) => {
                    const isImage = (item.type && item.type.startsWith('image/')) ||
                                    (item.data && typeof item.data === 'string' && item.data.startsWith('data:image/')) ||
                                    (item.name && /\.(png|jpe?g|webp|gif|svg)$/i.test(item.name)) ||
                                    (item.url && /\.(png|jpe?g|webp|gif|svg)$/i.test(item.url));

                    const isPdf = (item.type && item.type.includes('pdf')) ||
                                  (item.data && typeof item.data === 'string' && item.data.startsWith('data:application/pdf')) ||
                                  (item.name && /\.pdf$/i.test(item.name)) ||
                                  (item.url && /\.pdf$/i.test(item.url));

                    const isExcel = (item.name && /\.(xlsx?|csv|ods|tsv)$/i.test(item.name)) ||
                                    (item.url && /\.(xlsx?|csv|ods|tsv)$/i.test(item.url));

                    const card = document.createElement('div');
                    card.style.cssText = 'background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(139, 92, 246, 0.25); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 10px; transition: all 0.2s ease;';

                    let previewHtml = '';
                    const fileSrc = item.data || item.url || '#';
                    const fileName = item.name || item.url || `Anexo ${index + 1}`;

                    if (isImage) {
                        previewHtml = `
                            <div style="height: 110px; width: 100%; border-radius: 8px; overflow: hidden; background: #0f0d1b; border: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; cursor: pointer; position: relative;">
                                <img src="${fileSrc}" alt="${fileName}" style="width: 100%; height: 100%; object-fit: cover;">
                            </div>
                        `;
                    } else if (isPdf) {
                        previewHtml = `
                            <div style="height: 80px; width: 100%; border-radius: 8px; background: rgba(239, 68, 68, 0.1); border: 1px dashed rgba(239, 68, 68, 0.3); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: #fca5a5; cursor: pointer;">
                                <i class="ph ph-file-pdf" style="font-size: 28px; color: #ef4444;"></i>
                                <span style="font-size: 11px; font-weight: 600; text-transform: uppercase;">Documento PDF</span>
                            </div>
                        `;
                    } else if (isExcel) {
                        previewHtml = `
                            <div style="height: 80px; width: 100%; border-radius: 8px; background: rgba(16, 185, 129, 0.1); border: 1px dashed rgba(16, 185, 129, 0.3); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: #6ee7b7; cursor: pointer;">
                                <i class="ph ph-file-xls" style="font-size: 28px; color: #10b981;"></i>
                                <span style="font-size: 11px; font-weight: 600; text-transform: uppercase;">Planilha Excel</span>
                            </div>
                        `;
                    } else {
                        const ext = (fileName.split('.').pop() || 'file').toUpperCase();
                        previewHtml = `
                            <div style="height: 75px; width: 100%; border-radius: 8px; background: rgba(139, 92, 246, 0.1); border: 1px dashed rgba(139, 92, 246, 0.3); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: #a78bfa;">
                                <i class="ph ph-file-text" style="font-size: 26px;"></i>
                                <span style="font-size: 11px; font-weight: 600;">${ext}</span>
                            </div>
                        `;
                    }

                    card.innerHTML = `
                        ${previewHtml}
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                            <span style="font-size: 13px; font-weight: 600; color: #f1f5f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;" title="${fileName}">${fileName}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;">
                            <button type="button" class="btn-preview-card" title="Visualizar no site" style="flex: 1; height: 36px; padding: 0; background: rgba(109, 40, 217, 0.25); border: 1px solid rgba(139, 92, 246, 0.4); color: #c4b5fd; border-radius: 6px; font-size: 16px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s;">
                                <i class="ph ph-eye"></i>
                            </button>
                            <a href="${fileSrc}" ${item.name ? `download="${item.name}"` : ''} target="_blank" title="Baixar arquivo" style="flex: 1; height: 36px; padding: 0; background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.4); color: #93c5fd; border-radius: 6px; font-size: 16px; text-decoration: none; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s;">
                                <i class="ph ph-download-simple"></i>
                            </a>
                            <button type="button" class="btn-remove-view-card" title="Excluir anexo" style="flex: 1; height: 36px; padding: 0; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5; border-radius: 6px; font-size: 16px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s;">
                                <i class="ph ph-trash"></i>
                            </button>
                        </div>
                    `;

                    const btnPrev = card.querySelector('.btn-preview-card');
                    if (btnPrev) {
                        btnPrev.onclick = () => abrirPreviewAnexo(fileName, fileSrc, isImage ? 'image' : (isPdf ? 'pdf' : (isExcel ? 'excel' : 'other')));
                    }

                    const btnRem = card.querySelector('.btn-remove-view-card');
                    if (btnRem) {
                        btnRem.onclick = async () => {
                            attachmentsList.splice(index, 1);
                            g.anexo = attachmentsList.length > 0 ? JSON.stringify(attachmentsList) : '';
                            try {
                                await supabaseClient.from("guias").update({ anexo: g.anexo, dataAtualizacao: Date.now() }).eq("id", g.id);
                                showToast("Anexo removido do tutorial!", "success");
                                window.visualizarGuia(g.id);
                                renderGuias();
                            } catch (err) {
                                console.error("Erro ao remover anexo:", err);
                                showToast("Erro ao remover anexo", "error");
                            }
                        };
                    }

                    containerCards.appendChild(card);
                });
            }
        } else {
            if (sidePanel) sidePanel.style.display = 'none';
        }

        const btnCopy = document.getElementById('btnCopyViewGuia');
        if (btnCopy) {
            const newBtnCopy = btnCopy.cloneNode(true);
            btnCopy.parentNode.replaceChild(newBtnCopy, btnCopy);

            newBtnCopy.addEventListener('click', () => {
                let texto = '';
                if (g.conteudo) texto += `${g.conteudo}\n`;
                if (attachmentsList.length > 0) {
                    const names = attachmentsList.map(a => a.name || a.url).filter(Boolean).join(', ');
                    if (names) texto += `\n*Anexos:* ${names}`;
                }
                texto = texto.trim();

                navigator.clipboard.writeText(texto).then(() => {
                    showToast('Conteúdo copiado para a área de transferência!', 'success');
                    newBtnCopy.innerHTML = '<i class="ph ph-check" style="font-size: 18px;"></i> Copiado';
                    setTimeout(() => {
                        newBtnCopy.innerHTML = '<i class="ph ph-copy" style="font-size: 18px;"></i> Copiar';
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
        document.getElementById('modalDeleteTitle').textContent = 'Excluir tutorial';
        document.getElementById('modalDeleteText').textContent = 'Você tem certeza que quer deletar este tutorial?';
        modalExcluir.classList.add('active');
    };

    window.deletarGuia = (id) => {
        openDeleteGuiaModal(id);
    };

    window.editGuia = (id) => {
        openGuiaModal(id);
    };

    function renderGuias() {
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
            const emptyTr = document.createElement('tr');
            emptyTr.className = 'empty-state-row';
            emptyTr.innerHTML = `
                <td colspan="6" class="empty-state-cell">
                    <i class="ph ph-magnifying-glass"></i>
                    <span>Nenhum tutorial encontrado.</span>
                </td>
            `;
            tbody.appendChild(emptyTr);
            renderPagination('paginationGuiaContainer', 'guias', 0, 15, renderGuias);
            return;
        }

        const limit = (personalConfig && personalConfig.limiteLinhas && personalConfig.limiteLinhas.guias)
        ? parseInt(personalConfig.limiteLinhas.guias, 10)
        : ((configuracoes && configuracoes.limiteLinhas && configuracoes.limiteLinhas.guias) ? parseInt(configuracoes.limiteLinhas.guias, 10) : 10);
        const totalPages = Math.ceil(filtered.length / limit) || 1;
        if (paginationState.guias > totalPages) paginationState.guias = totalPages;
        const start = (paginationState.guias - 1) * limit;
        const pagedGuias = filtered.slice(start, start + limit);

        pagedGuias.forEach(g => {
            const tr = document.createElement('tr');

            const tdDesc = document.createElement('td');
            tdDesc.textContent = g.titulo || '-';

            const tdTipo = document.createElement('td');
            tdTipo.style.textAlign = 'center';
            tdTipo.innerHTML = `<span class="status-badge" style="background-color: rgba(255,255,255,0.1);">${g.tipo || '-'}</span>`;

            const tdAutor = document.createElement('td');
            tdAutor.style.textAlign = 'center';
            tdAutor.textContent = g.autor || '-';

            const dataC = g.dataCriacao ? new Date(g.dataCriacao).toLocaleDateString('pt-BR') : '-';
            const tdCriacao = document.createElement('td');
            tdCriacao.style.textAlign = 'center';
            tdCriacao.textContent = dataC;

            const dataA = g.dataAtualizacao ? new Date(g.dataAtualizacao).toLocaleDateString('pt-BR') : '-';
            const tdAtt = document.createElement('td');
            tdAtt.style.textAlign = 'center';
            tdAtt.textContent = dataA;

            const tdActions = document.createElement('td');
            tdActions.style.textAlign = 'center';
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
        swatches: [],
        components: {
            preview: true,
            opacity: false,
            hue: true,
            interaction: {
                hex: false,
                input: true,
                save: false
            }
        }
    };

    const attachAutoSave = (pickrInst, inputId) => {
        const syncColor = () => {
            try {
                pickrInst.applyColor(true);
                const colorObj = pickrInst.getColor();
                if (colorObj) {
                    const hex = colorObj.toHEXA().toString();
                    const el = document.getElementById(inputId);
                    if (el) el.value = hex;
                }
            } catch (err) { }
        };
        pickrInst.on('change', () => syncColor());
        pickrInst.on('hide', () => syncColor());
    };

    if (document.getElementById('pickrNovoResponsavel')) {
        const pickrResp = Pickr.create({
            el: '#pickrNovoResponsavel',
            default: '#8b5cf6',
            ...pickrConfig
        });
        attachAutoSave(pickrResp, 'colorNovoResponsavel');
    }

    if (document.getElementById('pickrNovoMeio')) {
        const pickrMeio = Pickr.create({
            el: '#pickrNovoMeio',
            default: '#4C1D95',
            ...pickrConfig
        });
        attachAutoSave(pickrMeio, 'colorNovoMeio');
    }

    if (document.getElementById('pickrEditarOpcao')) {
        window.pickrEditarOpcao = Pickr.create({
            el: '#pickrEditarOpcao',
            default: '#8b5cf6',
            ...pickrConfig
        });
        attachAutoSave(window.pickrEditarOpcao, 'colorEditarOpcao');
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


// Lógica para Gerenciar Tipos Guia
const renderTiposGuiaTable = () => {
    const tbody = document.getElementById('tiposGuiaTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const guiaTiposList = ensureGuiaTipos();

    if (!guiaTiposList || guiaTiposList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center" style="padding: 20px;">Nenhum grupo cadastrado.</td></tr>';
        renderPagination('paginationTiposGuiaContainer', 'tiposGuia', 0, 15, renderTiposGuiaTable);
        return;
    }

    const limit = 15;
    const totalPages = Math.ceil(guiaTiposList.length / limit) || 1;
    if (!paginationState.tiposGuia || isNaN(paginationState.tiposGuia) || paginationState.tiposGuia < 1) {
        paginationState.tiposGuia = 1;
    }
    if (paginationState.tiposGuia > totalPages) paginationState.tiposGuia = totalPages;
    const start = (paginationState.tiposGuia - 1) * limit;
    const pagedTiposGuia = guiaTiposList.slice(start, start + limit);

    pagedTiposGuia.forEach((tipo, index) => {
        const tr = document.createElement('tr');
        const actionIndex = start + index;
        const count = guias ? guias.filter(g => g && g.tipo && g.tipo.trim().toLowerCase() === tipo.trim().toLowerCase()).length : 0;

        tr.innerHTML = `
            <td style="word-break: break-word; overflow-wrap: anywhere; word-wrap: break-word; line-height: 1.4; padding: 10px 14px;"><strong>${tipo}</strong></td>
            <td style="text-align: center; white-space: nowrap;"><span class="count-badge" style="background: rgba(139, 92, 246, 0.15); color: #c4b5fd; border: 1px solid rgba(139, 92, 246, 0.3); padding: 2px 10px; border-radius: 12px; font-weight: 600; font-size: 13px;">${count}</span></td>
            <td style="text-align: center; white-space: nowrap;">
                <div style="display: inline-flex; gap: 4px; justify-content: center;">
                    <button class="group-action-btn edit-btn" onclick="window.editarTipoGuia(${actionIndex})" title="Editar"><i class="ph ph-pencil-simple"></i></button>
                    <button class="group-action-btn delete-btn" onclick="window.deletarTipoGuia(${actionIndex})" title="Excluir"><i class="ph ph-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    renderPagination('paginationTiposGuiaContainer', 'tiposGuia', guiaTiposList.length, limit, renderTiposGuiaTable);
};
window.renderTiposGuiaTable = renderTiposGuiaTable;

document.getElementById('btnGerenciarTiposGuia')?.addEventListener('click', () => {
    const inp = document.getElementById('inputNovoTipoGuia');
    if (inp) inp.value = '';
    renderTiposGuiaTable();
    document.getElementById('modalGerenciarTiposGuia')?.classList.add('active');
});

document.getElementById('closeModalGerenciarTiposGuia')?.addEventListener('click', () => {
    document.getElementById('modalGerenciarTiposGuia')?.classList.remove('active');
});

document.getElementById('inputNovoTipoGuia')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('btnAdicionarTipoGuia')?.click();
    }
});

document.getElementById('btnAdicionarTipoGuia')?.addEventListener('click', async () => {
    const inputNovoTipoGuia = document.getElementById('inputNovoTipoGuia');
    const btnAdicionarTipoGuia = document.getElementById('btnAdicionarTipoGuia');
    if (!inputNovoTipoGuia) return;

    const novoTipo = inputNovoTipoGuia.value.trim();
    if (!novoTipo) return;

    ensureGuiaTipos();
    if (configuracoes.guiaTipos.some(t => t.trim().toLowerCase() === novoTipo.toLowerCase())) {
        showToast('Grupo já existe', 'error');
        return;
    }

    configuracoes.guiaTipos.push(novoTipo);

    try {
        if (btnAdicionarTipoGuia) btnAdicionarTipoGuia.disabled = true;
        const { error } = await supabaseClient.from('configuracoes').upsert([{ id: 'geral', dados: configuracoes }]);

        if (error) throw error;

        inputNovoTipoGuia.value = '';
        renderTiposGuiaTable();
        if (typeof window.updateGuiaFilterOptions === 'function') window.updateGuiaFilterOptions();
        showToast('Grupo adicionado com sucesso', 'success');
        if (typeof playSuccessSound === 'function') playSuccessSound();
    } catch (err) {
        console.error(err);
        showToast('Erro ao adicionar grupo', 'error');
        configuracoes.guiaTipos.pop();
    } finally {
        if (btnAdicionarTipoGuia) btnAdicionarTipoGuia.disabled = false;
    }
});

// Modal de Edição/Exclusão do Tipo Guia
const closeEd = () => document.getElementById('modalEditarTipoGuia')?.classList.remove('active');
const closeEx = () => document.getElementById('modalExcluirTipoGuia')?.classList.remove('active');
document.getElementById('btnCloseEditarTipoGuia')?.addEventListener('click', closeEd);
document.getElementById('btnCancelEditarTipoGuia')?.addEventListener('click', closeEd);
document.getElementById('btnCloseExcluirTipoGuia')?.addEventListener('click', closeEx);
document.getElementById('btnCancelExcluirTipoGuia')?.addEventListener('click', closeEx);

window.deletarTipoGuia = (index) => {
    ensureGuiaTipos();
    const oldValue = configuracoes.guiaTipos[index];
    const modal = document.getElementById('modalExcluirTipoGuia');
    const textExcluir = document.getElementById('textExcluirTipoGuia');
    const btnConfirm = document.getElementById('btnConfirmExcluirTipoGuia');

    if (!modal || !textExcluir || !btnConfirm || !oldValue) return;

    textExcluir.textContent = `Tem certeza que deseja excluir o grupo "${oldValue}"?`;

    const newBtnConfirm = btnConfirm.cloneNode(true);
    btnConfirm.parentNode.replaceChild(newBtnConfirm, btnConfirm);

    newBtnConfirm.addEventListener('click', async () => {
        const targetIndex = configuracoes.guiaTipos.findIndex(t => t === oldValue || t.trim().toLowerCase() === oldValue.trim().toLowerCase());
        if (targetIndex !== -1) {
            configuracoes.guiaTipos.splice(targetIndex, 1);
        }

        try {
            newBtnConfirm.disabled = true;
            newBtnConfirm.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';

            // Save configuration
            const { error } = await supabaseClient.from('configuracoes').upsert([{ id: 'geral', dados: configuracoes }]);
            if (error) throw error;

            // Cascade update assigned tutorials to 'Sem grupo'
            if (oldValue && typeof oldValue === 'string' && oldValue.trim() !== '') {
                const { error: cascadeErr } = await supabaseClient
                    .from('guias')
                    .update({ tipo: 'Sem grupo' })
                    .eq('tipo', oldValue);

                if (cascadeErr) {
                    console.error("Erro ao reatribuir guias para Sem grupo:", cascadeErr);
                }
                if (guias) {
                    guias.forEach(g => {
                        if (g && g.tipo && g.tipo.trim().toLowerCase() === oldValue.trim().toLowerCase()) g.tipo = 'Sem grupo';
                    });
                }
            }

            renderTiposGuiaTable();
            if (typeof window.updateGuiaFilterOptions === 'function') window.updateGuiaFilterOptions();
            renderGuias();
            showToast('Grupo excluído com sucesso', 'success');
            if (typeof playSuccessSound === 'function') playSuccessSound();
            modal.classList.remove('active');
        } catch (err) {
            console.error(err);
            showToast('Erro ao excluir grupo', 'error');
            ensureGuiaTipos();
        } finally {
            newBtnConfirm.disabled = false;
            newBtnConfirm.textContent = 'Excluir';
        }
    });

    modal.classList.add('active');
};

window.editarTipoGuia = (index) => {
    ensureGuiaTipos();
    const oldValue = configuracoes.guiaTipos[index];
    const modal = document.getElementById('modalEditarTipoGuia');
    const inputNome = document.getElementById('inputEditarNomeTipoGuia');
    const btnSave = document.getElementById('btnSaveEditarTipoGuia');

    if (!modal || !inputNome || !btnSave || !oldValue) return;

    inputNome.value = oldValue;

    const newBtnSave = btnSave.cloneNode(true);
    btnSave.parentNode.replaceChild(newBtnSave, btnSave);

    inputNome.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            newBtnSave.click();
        }
    };

    newBtnSave.addEventListener('click', async () => {
        const novoNome = inputNome.value.trim();
        if (!novoNome || novoNome === oldValue) {
            modal.classList.remove('active');
            return;
        }
        if (configuracoes.guiaTipos.some(t => t.trim().toLowerCase() === novoNome.toLowerCase() && t !== oldValue)) {
            showToast('Este grupo já existe', 'error');
            return;
        }

        const targetIndex = configuracoes.guiaTipos.findIndex(t => t === oldValue || t.trim().toLowerCase() === oldValue.trim().toLowerCase());
        if (targetIndex !== -1) {
            configuracoes.guiaTipos[targetIndex] = novoNome;
        }

        try {
            newBtnSave.disabled = true;
            newBtnSave.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';

            // Save configuration
            const { error } = await supabaseClient.from('configuracoes').upsert([{ id: 'geral', dados: configuracoes }]);
            if (error) throw error;

            // Cascade update assigned tutorials to new group name
            if (oldValue && typeof oldValue === 'string' && oldValue.trim() !== '') {
                const { error: cascadeErr } = await supabaseClient
                    .from('guias')
                    .update({ tipo: novoNome })
                    .eq('tipo', oldValue);

                if (cascadeErr) {
                    console.error("Erro na atualização em cascata das guias:", cascadeErr);
                }
                if (guias) {
                    guias.forEach(g => {
                        if (g && g.tipo && g.tipo.trim().toLowerCase() === oldValue.trim().toLowerCase()) g.tipo = novoNome;
                    });
                }
            }

            renderTiposGuiaTable();
            if (typeof window.updateGuiaFilterOptions === 'function') window.updateGuiaFilterOptions();
            renderGuias();
            showToast('Grupo atualizado com sucesso', 'success');
            modal.classList.remove('active');
        } catch (err) {
            console.error(err);
            showToast('Erro ao atualizar grupo', 'error');
            ensureGuiaTipos();
        } finally {
            newBtnSave.disabled = false;
            newBtnSave.textContent = 'Salvar';
        }
    });

    modal.classList.add('active');
};


// ==========================================
// MÓDULO LEMBRETES & NOTIFICAÇÕES (72H RULE)
// ==========================================
let editingLembreteId = null;
let deleteLembreteId = null;

async function persistLembretes() {
    const sKey = getCurrentUserStorageKey('cd_lembretes');
    const dbId = getCurrentUserSupabaseId('lembretes');
    try {
        localStorage.setItem(sKey, JSON.stringify(lembretes || []));
    } catch(e) {}
    try {
        await supabaseClient.from('configuracoes').upsert([{ id: dbId, dados: { lista: lembretes || [] } }]);
    } catch (e) {
        console.warn('Erro ao sincronizar lembretes pessoais:', e);
    }
}
window.persistLembretes = persistLembretes;

function fetchLembretes() {
    const sKey = getCurrentUserStorageKey('cd_lembretes');
    const dbId = getCurrentUserSupabaseId('lembretes');
    try {
        const local = localStorage.getItem(sKey);
        if (local) {
            lembretes = JSON.parse(local);
        } else {
            const oldLocal = localStorage.getItem('cd_lembretes');
            if (oldLocal) {
                lembretes = JSON.parse(oldLocal);
                try { localStorage.setItem(sKey, oldLocal); } catch(e) {}
            }
        }
    } catch(e) {}
    renderLembretes();

    supabaseClient.from('configuracoes').select('*').eq('id', dbId).maybeSingle().then(async ({ data, error }) => {
        if (data && data.dados && Array.isArray(data.dados.lista)) {
            lembretes = data.dados.lista;
            try {
                localStorage.setItem(sKey, JSON.stringify(lembretes));
            } catch(e) {}
            renderLembretes();
        } else if (!lembretes || lembretes.length === 0) {
            try {
                const { data: oldShared } = await supabaseClient.from('configuracoes').select('*').eq('id', 'lembretes').maybeSingle();
                if (oldShared && oldShared.dados && Array.isArray(oldShared.dados.lista) && oldShared.dados.lista.length > 0) {
                    lembretes = oldShared.dados.lista;
                    try { localStorage.setItem(sKey, JSON.stringify(lembretes)); } catch(e) {}
                    renderLembretes();
                    persistLembretes();
                }
            } catch(e) {}
        }
    }).catch(() => {});
}
window.fetchLembretes = fetchLembretes;

function renderLembretes() {
    const tbody = document.getElementById('lembretesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const searchQuery = (document.getElementById('inputBuscarLembrete')?.value || '').toLowerCase();

    let filtered = lembretes || [];
    if (searchQuery) {
        filtered = filtered.filter(l =>
            (l.titulo && l.titulo.toLowerCase().includes(searchQuery)) ||
            (l.descricao && l.descricao.toLowerCase().includes(searchQuery))
        );
    }

    if (filtered.length === 0) {
        const emptyTr = document.createElement('tr');
        emptyTr.className = 'empty-state-row';
        emptyTr.innerHTML = `
            <td colspan="5" class="empty-state-cell">
                <i class="ph ph-magnifying-glass"></i>
                <span>Nenhum lembrete encontrado.</span>
            </td>
        `;
        tbody.appendChild(emptyTr);
        renderPagination('paginationLembretesContainer', 'lembretes', 0, 15, renderLembretes);
        return;
    }

    const limit = (personalConfig && personalConfig.limiteLinhas && personalConfig.limiteLinhas.lembretes)
        ? parseInt(personalConfig.limiteLinhas.lembretes, 10)
        : ((configuracoes && configuracoes.limiteLinhas && configuracoes.limiteLinhas.lembretes) ? parseInt(configuracoes.limiteLinhas.lembretes, 10) : 10);
    const totalPages = Math.ceil(filtered.length / limit) || 1;
    if (!paginationState.lembretes || isNaN(paginationState.lembretes) || paginationState.lembretes < 1) {
        paginationState.lembretes = 1;
    }
    if (paginationState.lembretes > totalPages) paginationState.lembretes = totalPages;
    const start = (paginationState.lembretes - 1) * limit;
    const paged = filtered.slice(start, start + limit);

    const readOnlyLembretes = isPageReadOnly('lembretes');

    paged.forEach(item => {
        const tr = document.createElement('tr');

        let dataHoraFormatted = '-';
        let isOverdue = false;
        
        let dateObj = null;
        if (item.data && item.hora) {
            dateObj = new Date(`${item.data}T${item.hora}`);
        } else if (item.dataHora) {
            dateObj = new Date(item.dataHora);
        }

        if (dateObj && !isNaN(dateObj.getTime())) {
            const dia = String(dateObj.getDate()).padStart(2, '0');
            const mes = String(dateObj.getMonth() + 1).padStart(2, '0');
            const ano = dateObj.getFullYear();
            const hora = String(dateObj.getHours()).padStart(2, '0');
            const min = String(dateObj.getMinutes()).padStart(2, '0');
            dataHoraFormatted = `${dia}/${mes}/${ano} às ${hora}:${min}`;
            if (dateObj.getTime() <= Date.now() && item.status !== 'Concluído') {
                isOverdue = true;
            }
        }

        let criadoEmFormatted = '-';
        if (item.criadoEm) {
            const c = new Date(item.criadoEm);
            if (!isNaN(c.getTime())) {
                criadoEmFormatted = c.toLocaleDateString('pt-BR');
            }
        }

        let statusBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #fcd34d; border: 1px solid rgba(245, 158, 11, 0.3);">Pendente</span>`;
        if (item.status === 'Concluído') {
            statusBadge = `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.3);">Concluído</span>`;
        }

        const dataHoraBadge = isOverdue
            ? `<span style="color: #f87171; font-weight: 600;"><i class="ph ph-warning-circle" style="vertical-align: middle;"></i> ${dataHoraFormatted}</span>`
            : `<span>${dataHoraFormatted}</span>`;

        const actionsCol = readOnlyLembretes ? '' : `
            <td style="text-align: center; white-space: nowrap;">
                <div style="display: inline-flex; gap: 4px; justify-content: center;">
                    <button class="group-action-btn edit-btn" onclick="window.toggleStatusLembrete('${item.id}')" title="${item.status === 'Concluído' ? 'Reabrir' : 'Concluir'}">
                        <i class="ph ph-${item.status === 'Concluído' ? 'arrow-counter-clockwise' : 'check'}"></i>
                    </button>
                    ${item.status !== 'Concluído' ? `
                    <button class="group-action-btn edit-btn" onclick="window.adiarLembreteAtual('${item.id}', 5)" title="Adiar (+5 min)">
                        <i class="ph ph-clock-afternoon"></i>
                    </button>
                    ` : ''}
                    <button class="group-action-btn edit-btn" onclick="window.editarLembrete('${item.id}')" title="Editar">
                        <i class="ph ph-pencil-simple"></i>
                    </button>
                    <button class="group-action-btn delete-btn" onclick="window.deletarLembrete('${item.id}')" title="Excluir">
                        <i class="ph ph-trash"></i>
                    </button>
                </div>
            </td>
        `;

        tr.innerHTML = `
            <td style="word-break: break-word;">
                <strong style="${item.status === 'Concluído' ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${item.titulo}</strong>
                ${item.descricao ? `<br><small style="color: var(--text-sidebar); font-weight: normal;">${item.descricao}</small>` : ''}
            </td>
            <td style="text-align: center;">${dataHoraBadge}</td>
            <td style="text-align: center;">${statusBadge}</td>
            <td style="text-align: center;"><span style="font-size: 13px; color: var(--text-sidebar); font-weight: 500;">${criadoEmFormatted}</span></td>
            ${actionsCol}
        `;
        tbody.appendChild(tr);
    });

    renderPagination('paginationLembretesContainer', 'lembretes', filtered.length, limit, renderLembretes);
}
window.renderLembretes = renderLembretes;

window.toggleStatusLembrete = async (id) => {
    const item = lembretes.find(l => String(l.id) === String(id));
    if (!item) return;
    const novoStatus = item.status === 'Concluído' ? 'Pendente' : 'Concluído';
    item.status = novoStatus;
    item.concluidoEm = novoStatus === 'Concluído' ? Date.now() : null;
    renderLembretes();

    try {
        await persistLembretes();
        showToast(novoStatus === 'Concluído' ? 'Lembrete concluído!' : 'Lembrete reaberto!', 'success');
        if (typeof playSuccessSound === 'function') playSuccessSound();
    } catch (e) {
        console.error(e);
    }
};

const openLembreteModal = (id = null) => {
    editingLembreteId = id;
    const modal = document.getElementById('modalNovoLembrete');
    const title = document.getElementById('modalLembreteTitle');
    const inputTitulo = document.getElementById('inputLembreteTitulo');
    const inputData = document.getElementById('inputLembreteData');
    const inputHora = document.getElementById('inputLembreteHora');
    const inputDescricao = document.getElementById('inputLembreteDescricao');

    if (!modal) return;

    if (id) {
        const item = lembretes.find(l => String(l.id) === String(id));
        if (item) {
            title.textContent = 'Editar Lembrete';
            if (inputTitulo) inputTitulo.value = item.titulo || '';
            const dVal = item.data || (item.dataHora ? item.dataHora.split('T')[0] : new Date().toISOString().split('T')[0]);
            const hVal = item.hora || (item.dataHora ? item.dataHora.split('T')[1]?.substring(0, 5) : '09:00');

            if (typeof lembreteDatePicker !== 'undefined' && lembreteDatePicker) {
                lembreteDatePicker.setDate(dVal);
            } else if (inputData) {
                inputData.value = dVal;
            }

            if (typeof lembreteTimePicker !== 'undefined' && lembreteTimePicker) {
                lembreteTimePicker.setDate(hVal);
            } else if (inputHora) {
                inputHora.value = hVal;
            }

            if (inputDescricao) inputDescricao.value = item.descricao || '';
        }
    } else {
        title.textContent = 'Novo Lembrete';
        if (inputTitulo) inputTitulo.value = '';
        const todayStr = new Date().toISOString().split('T')[0];
        const nowTimeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        if (typeof lembreteDatePicker !== 'undefined' && lembreteDatePicker) {
            lembreteDatePicker.setDate(todayStr);
        } else if (inputData) {
            inputData.value = todayStr;
        }

        if (typeof lembreteTimePicker !== 'undefined' && lembreteTimePicker) {
            lembreteTimePicker.setDate(nowTimeStr);
        } else if (inputHora) {
            inputHora.value = nowTimeStr;
        }

        if (inputDescricao) inputDescricao.value = '';
    }
    modal.classList.add('active');
    setTimeout(() => inputTitulo && inputTitulo.focus(), 100);
};
window.editarLembrete = (id) => openLembreteModal(id);

window.deletarLembrete = (id) => {
    deleteLembreteId = id;
    const modal = document.getElementById('modalExcluirLembrete');
    if (modal) modal.classList.add('active');
};

document.getElementById('btnNovoLembrete')?.addEventListener('click', () => openLembreteModal(null));
document.getElementById('btnCloseLembrete')?.addEventListener('click', () => document.getElementById('modalNovoLembrete')?.classList.remove('active'));
document.getElementById('btnCancelLembrete')?.addEventListener('click', () => document.getElementById('modalNovoLembrete')?.classList.remove('active'));

document.getElementById('btnCloseExcluirLembrete')?.addEventListener('click', () => document.getElementById('modalExcluirLembrete')?.classList.remove('active'));
document.getElementById('btnCancelExcluirLembrete')?.addEventListener('click', () => document.getElementById('modalExcluirLembrete')?.classList.remove('active'));

// Validation and Enter key navigation for Lembretes form
const getFirstMissingLembreteField = () => {
    const titulo = document.getElementById('inputLembreteTitulo')?.value.trim();
    const data = document.getElementById('inputLembreteData')?.value.trim();
    const hora = document.getElementById('inputLembreteHora')?.value.trim();
    const descricao = document.getElementById('inputLembreteDescricao')?.value.trim();

    if (!titulo) return { field: document.getElementById('inputLembreteTitulo'), label: 'Título / Lembrete' };
    if (!data) return { field: document.getElementById('inputLembreteData'), label: 'Data' };
    if (!hora) return { field: document.getElementById('inputLembreteHora'), label: 'Hora' };
    if (!descricao) return { field: document.getElementById('inputLembreteDescricao'), label: 'Descrição' };
    return null;
};

const formLembreteEl = document.getElementById('formLembrete');
if (formLembreteEl) {
    let lastLembreteEnterTime = 0;
    formLembreteEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (e.target.tagName === 'TEXTAREA' && e.shiftKey) return;

            e.preventDefault();
            const now = Date.now();
            if (now - lastLembreteEnterTime < 500) return;
            lastLembreteEnterTime = now;

            const missing = getFirstMissingLembreteField();
            if (missing) {
                showToast(`Preencha o campo "${missing.label}".`, 'warning');
                if (missing.field) missing.field.focus();
            } else {
                formLembreteEl.requestSubmit();
            }
        }
    });

    formLembreteEl.addEventListener('submit', async (e) => {
        e.preventDefault();

        const missing = getFirstMissingLembreteField();
        if (missing) {
            showToast(`Preencha o campo "${missing.label}".`, 'warning');
            if (missing.field) missing.field.focus();
            return;
        }

        const titulo = document.getElementById('inputLembreteTitulo').value.trim();
        const data = document.getElementById('inputLembreteData').value.trim();
        const hora = document.getElementById('inputLembreteHora').value.trim();
        const descricao = document.getElementById('inputLembreteDescricao').value.trim();

        if (editingLembreteId) {
            const index = lembretes.findIndex(l => String(l.id) === String(editingLembreteId));
            if (index !== -1) {
                lembretes[index] = {
                    ...lembretes[index],
                    titulo,
                    data,
                    hora,
                    descricao,
                    atualizadoEm: new Date().toISOString()
                };
                renderLembretes();
                await persistLembretes();
                showToast('Lembrete atualizado com sucesso!', 'success');
                if (typeof playSuccessSound === 'function') playSuccessSound();
            }
        } else {
            const novoLembrete = {
                id: String(Date.now()),
                titulo,
                data,
                hora,
                descricao,
                status: 'Pendente',
                concluidoEm: null,
                criadoEm: new Date().toISOString()
            };
            lembretes.unshift(novoLembrete);
            renderLembretes();
            await persistLembretes();
            showToast('Lembrete criado com sucesso!', 'success');
            if (typeof playSuccessSound === 'function') playSuccessSound();
            criarNotificacao(`Novo lembrete: "${titulo}"`, 'Lembretes');
        }
        document.getElementById('modalNovoLembrete')?.classList.remove('active');
    });
}

document.getElementById('btnConfirmExcluirLembrete')?.addEventListener('click', async () => {
    if (!deleteLembreteId) return;
    lembretes = lembretes.filter(l => String(l.id) !== String(deleteLembreteId));
    renderLembretes();
    document.getElementById('modalExcluirLembrete')?.classList.remove('active');
    try {
        lembretes = lembretes.filter(l => String(l.id) !== String(deleteLembreteId)); renderLembretes(); await persistLembretes();
        showToast('Lembrete excluído com sucesso!', 'success');
    } catch (e) {
        console.error(e);
    }
});

document.getElementById('inputBuscarLembrete')?.addEventListener('input', () => renderLembretes());
document.getElementById('btnResetLembrete')?.addEventListener('click', () => {
    const inp = document.getElementById('inputBuscarLembrete');
    if (inp) inp.value = '';
    renderLembretes();
});

// Periodic alert loop, Pop-Up Modal trigger and 24-hour auto-deletion check for completed lembretes
let activeAlertaLembreteId = null;
let activeAlertaItem = null;

function exibirPopUpAlertaLembrete(item) {
    if (!item) return;
    if (typeof stopNotificationSound === 'function') stopNotificationSound();
    activeAlertaLembreteId = item.id;
    activeAlertaItem = item;

    const modal = document.getElementById('modalAlertaLembrete');
    const tituloEl = document.getElementById('modalAlertaLembreteTitulo');
    const dataHoraEl = document.getElementById('modalAlertaLembreteDataHora');
    const descEl = document.getElementById('modalAlertaLembreteDescricao');

    if (tituloEl) tituloEl.textContent = item.titulo || 'Lembrete';

    let dataHoraStr = '-';
    let dateObj = null;
    if (item.data && item.hora) {
        dateObj = new Date(`${item.data}T${item.hora}`);
    } else if (item.dataHora) {
        dateObj = new Date(item.dataHora);
    }
    if (dateObj && !isNaN(dateObj.getTime())) {
        const dia = String(dateObj.getDate()).padStart(2, '0');
        const mes = String(dateObj.getMonth() + 1).padStart(2, '0');
        const ano = dateObj.getFullYear();
        const hora = String(dateObj.getHours()).padStart(2, '0');
        const min = String(dateObj.getMinutes()).padStart(2, '0');
        dataHoraStr = `${dia}/${mes}/${ano} às ${hora}:${min}`;
    }
    if (dataHoraEl) dataHoraEl.textContent = dataHoraStr;

    if (descEl) {
        descEl.textContent = item.descricao || 'Sem descrição adicional.';
        descEl.style.display = item.descricao ? 'block' : 'none';
    }

    if (modal) {
        modal.classList.add('active');
    }
}
window.exibirPopUpAlertaLembrete = exibirPopUpAlertaLembrete;

window.adiarLembreteAtual = async (id, minAdiar = 5) => {
    const lembreteId = id || activeAlertaLembreteId;
    if (!lembreteId && !activeAlertaItem) return;

    let item = lembretes.find(l => String(l.id) === String(lembreteId));
    if (!item && activeAlertaItem) {
        item = activeAlertaItem;
        lembretes.push(item);
    }
    if (!item) return;

    const newDateObj = new Date(Date.now() + minAdiar * 60 * 1000);
    const ano = newDateObj.getFullYear();
    const mes = String(newDateObj.getMonth() + 1).padStart(2, '0');
    const dia = String(newDateObj.getDate()).padStart(2, '0');
    const hora = String(newDateObj.getHours()).padStart(2, '0');
    const min = String(newDateObj.getMinutes()).padStart(2, '0');

    item.data = `${ano}-${mes}-${dia}`;
    item.hora = `${hora}:${min}`;
    item.dataHora = `${ano}-${mes}-${dia}T${hora}:${min}`;
    item.status = 'Pendente';

    if (typeof stopLembreteSound === 'function') stopLembreteSound();

    const modal = document.getElementById('modalAlertaLembrete');
    if (modal) modal.classList.remove('active');
    activeAlertaLembreteId = null;
    activeAlertaItem = null;

    renderLembretes();
    try {
        await persistLembretes();
    } catch (err) {
        console.error('Erro ao adiar lembrete:', err);
    }

    const notifMsg = `Lembrete "${item.titulo}" adiado em +${minAdiar} min (alerta reagendado para ${hora}:${min})`;
    if (typeof criarNotificacao === 'function') {
        criarNotificacao(notifMsg, 'Lembretes');
    }
    showToast(`⏰ ${notifMsg}`, 'info', false);
};

window.concluirLembreteAtual = async (id) => {
    const lembreteId = id || activeAlertaLembreteId;
    if (!lembreteId && !activeAlertaItem) return;

    let item = lembretes.find(l => String(l.id) === String(lembreteId));
    if (!item && activeAlertaItem) {
        item = activeAlertaItem;
        lembretes.push(item);
    }
    if (!item) return;

    item.status = 'Concluído';
    item.concluidoEm = Date.now();

    if (typeof stopLembreteSound === 'function') stopLembreteSound();

    // Fechar automaticamente qualquer modal/pop-up aberto na tela para prevenir bugs
    document.querySelectorAll('.modal-overlay.active').forEach(modalEl => {
        modalEl.classList.remove('active');
    });

    activeAlertaLembreteId = null;
    activeAlertaItem = null;

    renderLembretes();
    try {
        await persistLembretes();
    } catch (err) {
        console.error('Erro ao concluir lembrete:', err);
    }

    const notifMsg = `Lembrete "${item.titulo}" marcado como concluído!`;
    if (typeof criarNotificacao === 'function') {
        criarNotificacao(notifMsg, 'Lembretes');
    }
    showToast(`✅ ${notifMsg}`, 'success', false);
    
    // Navegar diretamente para a página dos lembretes ao concluir
    const navItem = document.querySelector('.nav-item[data-page="lembretes"]');
    if (navItem) {
        navItem.click();
    } else {
        renderLembretes();
    }
};

// Event Listeners para botões do Modal de Alerta
document.addEventListener('DOMContentLoaded', () => {
    const btnAdiar = document.getElementById('btnAdiarLembreteAlerta');
    if (btnAdiar) {
        btnAdiar.addEventListener('click', () => {
            if (activeAlertaLembreteId) {
                window.adiarLembreteAtual(activeAlertaLembreteId, 5);
            }
        });
    }

    const btnConcluir = document.getElementById('btnConcluirLembreteAlerta');
    if (btnConcluir) {
        btnConcluir.addEventListener('click', () => {
            if (activeAlertaLembreteId) {
                window.concluirLembreteAtual(activeAlertaLembreteId);
            }
        });
    }
});

setInterval(async () => {
    if (!lembretes || !Array.isArray(lembretes) || lembretes.length === 0) return;

    const now = Date.now();
    let hasDeletions = false;

    for (let i = lembretes.length - 1; i >= 0; i--) {
        const item = lembretes[i];
        if (!item) continue;

        // 1. Check 24-hour auto deletion for completed items
        if (item.status === 'Concluído' && item.concluidoEm) {
            const timePassed = now - Number(item.concluidoEm);
            if (timePassed >= 24 * 60 * 60 * 1000) { // 24 hours in ms
                const deletedId = item.id;
                lembretes.splice(i, 1);
                hasDeletions = true;
                try {
                    // persistência automática tratada após o loop
                } catch (err) {
                    console.error("Erro ao auto-deletar lembrete concluído de 24h:", err);
                }
                continue;
            }
        }

        // 2. Alert loop for active/uncompleted lembretes past due time
        if (item.status !== 'Concluído') {
            let targetTs = null;
            if (item.data && item.hora) {
                targetTs = new Date(`${item.data}T${item.hora}`).getTime();
            } else if (item.dataHora) {
                targetTs = new Date(item.dataHora).getTime();
            }

            if (targetTs && !isNaN(targetTs) && now >= targetTs) {
                const modalAlerta = document.getElementById('modalAlertaLembrete');
                if (!modalAlerta || !modalAlerta.classList.contains('active')) {
                    exibirPopUpAlertaLembrete(item);
                    if (typeof playLembreteSound === 'function') {
                        playLembreteSound(undefined, undefined, true);
                    }
                }
            }
        }
    }

    if (hasDeletions) {
        renderLembretes();
        persistLembretes();
    }
}, 3000);

// ==========================================
// EFEITO SONORO DE SUCESSO (WEB AUDIO API)
// ==========================================
// ==========================================
// ==========================================
// EFEITO SONORO DE SUCESSO / NOTIFICAÇÕES (WEB AUDIO API - 20 TONS)
// ==========================================
let activeNotificationAudioCtx = null;
let notificationLoopInterval = null;

function stopNotificationSound() {
    if (notificationLoopInterval) {
        clearInterval(notificationLoopInterval);
        notificationLoopInterval = null;
    }
    if (activeNotificationAudioCtx) {
        try { activeNotificationAudioCtx.close(); } catch (e) {}
        activeNotificationAudioCtx = null;
    }
    const btnPlay = document.getElementById('btnTestSound');
    if (btnPlay) {
        btnPlay.classList.remove('is-playing');
        btnPlay.innerHTML = '<i class="ph ph-play" style="font-size: 15px;"></i>';
    }
}
window.stopNotificationSound = stopNotificationSound;

async function playSuccessSound(overrideTone, overrideVol, isLoop = false) {
    try {
        stopNotificationSound();
        if (isLoop && typeof stopLembreteSound === 'function') {
            stopLembreteSound();
        }

        const volNum = (overrideVol !== undefined) ? overrideVol : (personalConfig && personalConfig.soundVolume !== undefined ? personalConfig.soundVolume : 100);
        const volume = volNum / 100;
        if (volume <= 0) return;

        const tone = overrideTone || (personalConfig && personalConfig.soundTone) || 'padrao';
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;

        if (isLoop) {
            const btnPlay = document.getElementById('btnTestSound');
            if (btnPlay) {
                btnPlay.classList.add('is-playing');
                btnPlay.innerHTML = '<i class="ph ph-stop" style="font-size: 15px;"></i>';
            }
        }

        const runNotificationAudio = async () => {
            if (activeNotificationAudioCtx) {
                try { activeNotificationAudioCtx.close(); } catch (e) {}
            }
            const ctx = new AudioContext();
            if (ctx.state === 'suspended') {
                await ctx.resume();
            }
            activeNotificationAudioCtx = ctx;

            const t0 = ctx.currentTime + 0.01;

            if (tone === 'padrao') {
                const osc1 = ctx.createOscillator(); const gain1 = ctx.createGain();
                osc1.type = 'sine'; osc1.frequency.setValueAtTime(659.25, t0);
                gain1.gain.setValueAtTime(0.12 * volume, t0); gain1.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
                osc1.connect(gain1); gain1.connect(ctx.destination); osc1.start(t0); osc1.stop(t0 + 0.22);

                const osc2 = ctx.createOscillator(); const gain2 = ctx.createGain();
                osc2.type = 'sine'; osc2.frequency.setValueAtTime(987.77, t0 + 0.07);
                gain2.gain.setValueAtTime(0.14 * volume, t0 + 0.07); gain2.gain.exponentialRampToValueAtTime(0.001, t0 + 0.40);
                osc2.connect(gain2); gain2.connect(ctx.destination); osc2.start(t0 + 0.07); osc2.stop(t0 + 0.40);
            } else if (tone === 'sino') {
                [523.25, 659.25, 783.99].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.06);
                    gain.gain.setValueAtTime(0.15 * volume, t0 + idx * 0.06);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.06 + 0.5);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.06); osc.stop(t0 + idx * 0.06 + 0.5);
                });
            } else if (tone === 'chime') {
                const osc1 = ctx.createOscillator(); const gain1 = ctx.createGain();
                osc1.type = 'triangle'; osc1.frequency.setValueAtTime(880, t0);
                gain1.gain.setValueAtTime(0.18 * volume, t0); gain1.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15);
                osc1.connect(gain1); gain1.connect(ctx.destination); osc1.start(t0); osc1.stop(t0 + 0.15);

                const osc2 = ctx.createOscillator(); const gain2 = ctx.createGain();
                osc2.type = 'sine'; osc2.frequency.setValueAtTime(1318.5, t0 + 0.05);
                gain2.gain.setValueAtTime(0.2 * volume, t0 + 0.05); gain2.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
                osc2.connect(gain2); gain2.connect(ctx.destination); osc2.start(t0 + 0.05); osc2.stop(t0 + 0.25);
            } else if (tone === 'beep') {
                const osc1 = ctx.createOscillator(); const gain1 = ctx.createGain();
                osc1.type = 'square'; osc1.frequency.setValueAtTime(750, t0);
                gain1.gain.setValueAtTime(0.08 * volume, t0); gain1.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
                osc1.connect(gain1); gain1.connect(ctx.destination); osc1.start(t0); osc1.stop(t0 + 0.08);

                const osc2 = ctx.createOscillator(); const gain2 = ctx.createGain();
                osc2.type = 'square'; osc2.frequency.setValueAtTime(1000, t0 + 0.09);
                gain2.gain.setValueAtTime(0.08 * volume, t0 + 0.09); gain2.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
                osc2.connect(gain2); gain2.connect(ctx.destination); osc2.start(t0 + 0.09); osc2.stop(t0 + 0.18);
            } else if (tone === 'harpa') {
                [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.06);
                    gain.gain.setValueAtTime(0.12 * volume, t0 + idx * 0.06);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.06 + 0.35);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.06); osc.stop(t0 + idx * 0.06 + 0.35);
                });
            } else if (tone === 'slack') {
                [220, 180].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'triangle'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.08);
                    gain.gain.setValueAtTime(0.25 * volume, t0 + idx * 0.08);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.08 + 0.07);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.08); osc.stop(t0 + idx * 0.08 + 0.07);
                });
            } else if (tone === 'teams') {
                [440, 880].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.09);
                    gain.gain.setValueAtTime(0.15 * volume, t0 + idx * 0.09);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.09 + 0.12);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.09); osc.stop(t0 + idx * 0.09 + 0.12);
                });
            } else if (tone === 'whatsapp') {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sine'; osc.frequency.setValueAtTime(1046.50, t0);
                gain.gain.setValueAtTime(0.22 * volume, t0); gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
                osc.connect(gain); gain.connect(ctx.destination); osc.start(t0); osc.stop(t0 + 0.18);
            } else if (tone === 'telegram') {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sine'; osc.frequency.setValueAtTime(700, t0);
                osc.frequency.exponentialRampToValueAtTime(1400, t0 + 0.12);
                gain.gain.setValueAtTime(0.18 * volume, t0); gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.20);
                osc.connect(gain); gain.connect(ctx.destination); osc.start(t0); osc.stop(t0 + 0.20);
            } else if (tone === 'discord') {
                [800, 600].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.06);
                    gain.gain.setValueAtTime(0.16 * volume, t0 + idx * 0.06);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.06 + 0.14);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.06); osc.stop(t0 + idx * 0.06 + 0.14);
                });
            } else if (tone === 'skype') {
                [1200, 1600].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.07);
                    gain.gain.setValueAtTime(0.14 * volume, t0 + idx * 0.07);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.07 + 0.20);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.07); osc.stop(t0 + idx * 0.07 + 0.20);
                });
            } else if (tone === 'iphone') {
                [1046.50, 1318.51, 1567.98].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.08);
                    gain.gain.setValueAtTime(0.16 * volume, t0 + idx * 0.08);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.08 + 0.22);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.08); osc.stop(t0 + idx * 0.08 + 0.22);
                });
            } else if (tone === 'windows') {
                [739.99, 880.00, 1108.73, 1318.51].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.05);
                    gain.gain.setValueAtTime(0.12 * volume, t0 + idx * 0.05);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.05 + 0.40);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.05); osc.stop(t0 + idx * 0.05 + 0.40);
                });
            } else if (tone === 'mario') {
                [987.77, 1318.51].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'square'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.08);
                    gain.gain.setValueAtTime(0.10 * volume, t0 + idx * 0.08);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.08 + 0.30);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.08); osc.stop(t0 + idx * 0.08 + 0.30);
                });
            } else if (tone === 'zelda') {
                [587.33, 783.99, 880.00, 1174.66].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'triangle'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.07);
                    gain.gain.setValueAtTime(0.15 * volume, t0 + idx * 0.07);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.07 + 0.25);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.07); osc.stop(t0 + idx * 0.07 + 0.25);
                });
            } else if (tone === 'cristal') {
                [1760, 2637, 3520].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.04);
                    gain.gain.setValueAtTime(0.08 * volume, t0 + idx * 0.04);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.04 + 0.35);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.04); osc.stop(t0 + idx * 0.04 + 0.35);
                });
            } else if (tone === 'radar') {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sine'; osc.frequency.setValueAtTime(1500, t0);
                osc.frequency.exponentialRampToValueAtTime(400, t0 + 0.25);
                gain.gain.setValueAtTime(0.20 * volume, t0); gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
                osc.connect(gain); gain.connect(ctx.destination); osc.start(t0); osc.stop(t0 + 0.25);
            } else if (tone === 'suave') {
                [1200, 900].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.10);
                    gain.gain.setValueAtTime(0.12 * volume, t0 + idx * 0.10);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.10 + 0.15);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.10); osc.stop(t0 + idx * 0.10 + 0.15);
                });
            } else if (tone === 'alerta') {
                [1500, 1800].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.06);
                    gain.gain.setValueAtTime(0.08 * volume, t0 + idx * 0.06);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.06 + 0.08);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.06); osc.stop(t0 + idx * 0.06 + 0.08);
                });
            } else if (tone === 'sucesso') {
                [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'triangle'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.07);
                    gain.gain.setValueAtTime(0.16 * volume, t0 + idx * 0.07);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.07 + 0.40);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.07); osc.stop(t0 + idx * 0.07 + 0.40);
                });
            } else if (tone === 'laser_scifi') {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sawtooth'; osc.frequency.setValueAtTime(1500, t0);
                osc.frequency.exponentialRampToValueAtTime(100, t0 + 0.15);
                gain.gain.setValueAtTime(0.18 * volume, t0); gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15);
                osc.connect(gain); gain.connect(ctx.destination); osc.start(t0); osc.stop(t0 + 0.15);
            } else if (tone === 'gota_dagua') {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sine'; osc.frequency.setValueAtTime(900, t0);
                osc.frequency.linearRampToValueAtTime(1600, t0 + 0.04);
                osc.frequency.exponentialRampToValueAtTime(300, t0 + 0.18);
                gain.gain.setValueAtTime(0.20 * volume, t0); gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
                osc.connect(gain); gain.connect(ctx.destination); osc.start(t0); osc.stop(t0 + 0.18);
            } else if (tone === 'moeda_retro') {
                [987.77, 1318.51].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'square'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.07);
                    gain.gain.setValueAtTime(0.10 * volume, t0 + idx * 0.07);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.07 + 0.25);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.07); osc.stop(t0 + idx * 0.07 + 0.25);
                });
            } else if (tone === 'bolha_sabao') {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sine'; osc.frequency.setValueAtTime(300, t0);
                osc.frequency.exponentialRampToValueAtTime(1100, t0 + 0.08);
                gain.gain.setValueAtTime(0.22 * volume, t0); gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
                osc.connect(gain); gain.connect(ctx.destination); osc.start(t0); osc.stop(t0 + 0.08);
            } else if (tone === 'trompete_curto') {
                [392, 523.25, 659.25].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.06);
                    gain.gain.setValueAtTime(0.10 * volume, t0 + idx * 0.06);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.06 + 0.30);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.06); osc.stop(t0 + idx * 0.06 + 0.30);
                });
            } else if (tone === 'apito_esportivo') {
                [2500, 2800].forEach(freq => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t0);
                    gain.gain.setValueAtTime(0.12 * volume, t0); gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0); osc.stop(t0 + 0.15);
                });
            } else if (tone === 'estalo_cristal') {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sine'; osc.frequency.setValueAtTime(3135.96, t0);
                gain.gain.setValueAtTime(0.18 * volume, t0); gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.30);
                osc.connect(gain); gain.connect(ctx.destination); osc.start(t0); osc.stop(t0 + 0.30);
            } else if (tone === 'sinos_vento') {
                [1046.50, 1318.51, 1567.98, 2093.00].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.08);
                    gain.gain.setValueAtTime(0.12 * volume, t0 + idx * 0.08);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.08 + 0.45);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.08); osc.stop(t0 + idx * 0.08 + 0.45);
                });
            } else if (tone === 'nivel_up') {
                [523.25, 659.25, 783.99, 1046.50, 1318.51].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'square'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.05);
                    gain.gain.setValueAtTime(0.08 * volume, t0 + idx * 0.05);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.05 + 0.20);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.05); osc.stop(t0 + idx * 0.05 + 0.20);
                });
            } else if (tone === 'robo_bip') {
                [800, 1600, 1200].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'square'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.04);
                    gain.gain.setValueAtTime(0.09 * volume, t0 + idx * 0.04);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.04 + 0.05);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.04); osc.stop(t0 + idx * 0.04 + 0.05);
                });
            } else if (tone === 'passaro') {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sine'; osc.frequency.setValueAtTime(1800, t0);
                osc.frequency.exponentialRampToValueAtTime(2600, t0 + 0.06);
                osc.frequency.exponentialRampToValueAtTime(2000, t0 + 0.14);
                gain.gain.setValueAtTime(0.16 * volume, t0); gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
                osc.connect(gain); gain.connect(ctx.destination); osc.start(t0); osc.stop(t0 + 0.14);
            } else if (tone === 'pulo_game') {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'triangle'; osc.frequency.setValueAtTime(200, t0);
                osc.frequency.exponentialRampToValueAtTime(1000, t0 + 0.15);
                gain.gain.setValueAtTime(0.20 * volume, t0); gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15);
                osc.connect(gain); gain.connect(ctx.destination); osc.start(t0); osc.stop(t0 + 0.15);
            } else if (tone === 'alerta_nuclear') {
                [880, 932].forEach(freq => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(freq, t0);
                    gain.gain.setValueAtTime(0.10 * volume, t0); gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0); osc.stop(t0 + 0.22);
                });
            } else if (tone === 'telefone_retro') {
                [440, 480].forEach(freq => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t0);
                    gain.gain.setValueAtTime(0.14 * volume, t0); gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0); osc.stop(t0 + 0.35);
                });
            } else if (tone === 'caixa_registradora') {
                [2093, 2637].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.05);
                    gain.gain.setValueAtTime(0.16 * volume, t0 + idx * 0.05);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.05 + 0.35);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.05); osc.stop(t0 + idx * 0.05 + 0.35);
                });
            } else if (tone === 'sineta_mesa') {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sine'; osc.frequency.setValueAtTime(1760, t0);
                gain.gain.setValueAtTime(0.22 * volume, t0); gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.50);
                osc.connect(gain); gain.connect(ctx.destination); osc.start(t0); osc.stop(t0 + 0.50);
            } else if (tone === 'vibrafone_jazz') {
                [440, 554.37, 659.25, 830.61].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'triangle'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.05);
                    gain.gain.setValueAtTime(0.15 * volume, t0 + idx * 0.05);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.05 + 0.40);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.05); osc.stop(t0 + idx * 0.05 + 0.40);
                });
            } else if (tone === 'guitarra_rock') {
                [146.83, 220.00, 293.66].forEach(freq => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(freq, t0);
                    gain.gain.setValueAtTime(0.12 * volume, t0); gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0); osc.stop(t0 + 0.45);
                });
            } else if (tone === 'magia_mistica') {
                [1567.98, 1760, 2093, 2349.32, 2637.02].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.04);
                    gain.gain.setValueAtTime(0.10 * volume, t0 + idx * 0.04);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.04 + 0.30);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.04); osc.stop(t0 + idx * 0.04 + 0.30);
                });
            } else if (tone === 'espada_laser') {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, t0);
                osc.frequency.linearRampToValueAtTime(450, t0 + 0.08);
                osc.frequency.exponentialRampToValueAtTime(80, t0 + 0.20);
                gain.gain.setValueAtTime(0.16 * volume, t0); gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.20);
                osc.connect(gain); gain.connect(ctx.destination); osc.start(t0); osc.stop(t0 + 0.20);
            } else if (tone === 'cuco_curto') {
                [783.99, 659.25].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.12);
                    gain.gain.setValueAtTime(0.18 * volume, t0 + idx * 0.12);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.12 + 0.20);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.12); osc.stop(t0 + idx * 0.12 + 0.20);
                });
            } else if (tone === 'notif_cosmica') {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sine'; osc.frequency.setValueAtTime(440, t0);
                osc.frequency.exponentialRampToValueAtTime(880, t0 + 0.30);
                gain.gain.setValueAtTime(0.14 * volume, t0); gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
                osc.connect(gain); gain.connect(ctx.destination); osc.start(t0); osc.stop(t0 + 0.35);
            } else if (tone === 'bip_espacial') {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sine'; osc.frequency.setValueAtTime(2400, t0);
                gain.gain.setValueAtTime(0.15 * volume, t0); gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
                osc.connect(gain); gain.connect(ctx.destination); osc.start(t0); osc.stop(t0 + 0.08);
            } else if (tone === 'palmas_vitoria') {
                [800, 1200, 1000, 1400].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'triangle'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.04);
                    gain.gain.setValueAtTime(0.15 * volume, t0 + idx * 0.04);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.04 + 0.06);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.04); osc.stop(t0 + idx * 0.04 + 0.06);
                });
            } else if (tone === 'gongo_oriental') {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sine'; osc.frequency.setValueAtTime(130, t0);
                gain.gain.setValueAtTime(0.30 * volume, t0); gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.80);
                osc.connect(gain); gain.connect(ctx.destination); osc.start(t0); osc.stop(t0 + 0.80);
            } else if (tone === 'xilofone_divertido') {
                [659.25, 783.99, 1046.50].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.07);
                    gain.gain.setValueAtTime(0.18 * volume, t0 + idx * 0.07);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.07 + 0.20);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.07); osc.stop(t0 + idx * 0.07 + 0.20);
                });
            } else if (tone === 'sirene_curta') {
                [700, 1000].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.10);
                    gain.gain.setValueAtTime(0.10 * volume, t0 + idx * 0.10);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.10 + 0.12);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.10); osc.stop(t0 + idx * 0.10 + 0.12);
                });
            } else if (tone === 'snare_rim') {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'triangle'; osc.frequency.setValueAtTime(600, t0);
                gain.gain.setValueAtTime(0.25 * volume, t0); gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.04);
                osc.connect(gain); gain.connect(ctx.destination); osc.start(t0); osc.stop(t0 + 0.04);
            } else if (tone === 'acorde_harpa') {
                [392, 523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t0 + idx * 0.05);
                    gain.gain.setValueAtTime(0.14 * volume, t0 + idx * 0.05);
                    gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * 0.05 + 0.40);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0 + idx * 0.05); osc.stop(t0 + idx * 0.05 + 0.40);
                });
            } else if (tone === 'vitoria_epica') {
                [523.25, 659.25, 783.99, 1046.50].forEach(freq => {
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'triangle'; osc.frequency.setValueAtTime(freq, t0);
                    gain.gain.setValueAtTime(0.15 * volume, t0); gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.50);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t0); osc.stop(t0 + 0.50);
                });
            }
        };

        await runNotificationAudio();

        if (isLoop) {
            notificationLoopInterval = setInterval(() => {
                runNotificationAudio();
            }, 800);
        }
    } catch (e) {
        console.error('Audio feedback error (Notifications):', e);
    }
}
window.playSuccessSound = playSuccessSound;

// ==========================================
// EFEITO SONORO DE LEMBRETE 5-10s (WEB AUDIO API - 20 TONS)
// ==========================================
let activeLembreteAudioCtx = null;
let lembreteLoopInterval = null;

function stopLembreteSound() {
    if (lembreteLoopInterval) {
        clearInterval(lembreteLoopInterval);
        lembreteLoopInterval = null;
    }
    if (activeLembreteAudioCtx) {
        try { activeLembreteAudioCtx.close(); } catch (e) {}
        activeLembreteAudioCtx = null;
    }
    const btnPlay = document.getElementById('btnTestLembreteSound');
    if (btnPlay) {
        btnPlay.classList.remove('is-playing');
        btnPlay.innerHTML = '<i class="ph ph-play" style="font-size: 15px;"></i>';
    }
}
window.stopLembreteSound = stopLembreteSound;

let globalAudioCtxUnlocked = false;
function unlockAudioContext() {
    if (globalAudioCtxUnlocked) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
        try {
            const dummyCtx = new AudioContext();
            if (dummyCtx.state === 'suspended') {
                dummyCtx.resume().then(() => {
                    try { dummyCtx.close(); } catch(e){}
                    globalAudioCtxUnlocked = true;
                });
            } else {
                try { dummyCtx.close(); } catch(e){}
                globalAudioCtxUnlocked = true;
            }
        } catch(e) {}
    }
}
document.addEventListener('click', unlockAudioContext, { once: true });
document.addEventListener('keydown', unlockAudioContext, { once: true });

async function playLembreteSound(overrideTone, overrideVol, isLoop = false) {
    try {
        stopLembreteSound();
        if (isLoop && typeof stopNotificationSound === 'function') {
            stopNotificationSound();
        }

        const volNum = (overrideVol !== undefined && overrideVol !== null) ? overrideVol : (personalConfig && personalConfig.lembreteSoundVolume !== undefined ? personalConfig.lembreteSoundVolume : 100);
        const volume = volNum / 100;
        if (volume <= 0) return;

        const tone = overrideTone || (personalConfig && personalConfig.lembreteSoundTone) || 'alarme_despertador';
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;

        if (isLoop) {
            const btnPlay = document.getElementById('btnTestLembreteSound');
            if (btnPlay) {
                btnPlay.classList.add('is-playing');
                btnPlay.innerHTML = '<i class="ph ph-stop" style="font-size: 15px;"></i>';
            }
        }

        const runLembreteAudio = async () => {
            if (activeLembreteAudioCtx) {
                try { activeLembreteAudioCtx.close(); } catch (e) {}
            }
            const ctx = new AudioContext();
            if (ctx.state === 'suspended') {
                await ctx.resume();
            }
            activeLembreteAudioCtx = ctx;

            const startTime = ctx.currentTime + 0.01;

            if (tone === 'alarme_despertador') {
                const freqs = [880, 1108.73, 1318.51, 1760];
                const phraseIntervals = [0, 1.5, 3.0, 4.5, 6.0];
                phraseIntervals.forEach((startOffset) => {
                    freqs.forEach((freq, idx) => {
                        const t = startTime + startOffset + (idx * 0.08);
                        const osc = ctx.createOscillator(); const gain = ctx.createGain();
                        osc.type = 'square'; osc.frequency.setValueAtTime(freq, t);
                        gain.gain.setValueAtTime(0.08 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
                        osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.12);
                    });
                });
            } else if (tone === 'sirene_suave') {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sine';
                gain.gain.setValueAtTime(0, startTime); gain.gain.linearRampToValueAtTime(0.18 * volume, startTime + 0.3);
                gain.gain.setValueAtTime(0.18 * volume, startTime + 7.0); gain.gain.linearRampToValueAtTime(0.001, startTime + 7.5);
                osc.frequency.setValueAtTime(440, startTime);
                for (let cycle = 0; cycle < 3; cycle++) {
                    const tBase = startTime + (cycle * 2.5);
                    osc.frequency.linearRampToValueAtTime(880, tBase + 1.25);
                    osc.frequency.linearRampToValueAtTime(440, tBase + 2.5);
                }
                osc.connect(gain); gain.connect(ctx.destination); osc.start(startTime); osc.stop(startTime + 7.5);
            } else if (tone === 'melodia_tranquila') {
                const chordSequence = [
                    { offset: 0.0, freqs: [523.25, 659.25, 783.99], duration: 1.2 },
                    { offset: 1.5, freqs: [440.00, 523.25, 659.25], duration: 1.2 },
                    { offset: 3.0, freqs: [349.23, 440.00, 523.25], duration: 1.2 },
                    { offset: 4.5, freqs: [392.00, 493.88, 587.33], duration: 1.2 },
                    { offset: 6.0, freqs: [523.25, 659.25, 783.99, 1046.50], duration: 2.2 }
                ];
                chordSequence.forEach(chord => {
                    chord.freqs.forEach((freq, i) => {
                        const t = startTime + chord.offset + (i * 0.08);
                        const osc = ctx.createOscillator(); const gain = ctx.createGain();
                        osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t);
                        gain.gain.setValueAtTime(0.12 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + chord.duration);
                        osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + chord.duration);
                    });
                });
            } else if (tone === 'pulso_digital') {
                const pulseOffsets = [0, 1.8, 3.6, 5.4];
                pulseOffsets.forEach(startOffset => {
                    const freqs = [600, 800, 1200, 1600];
                    freqs.forEach((freq, i) => {
                        for (let echo = 0; echo < 2; echo++) {
                            const t = startTime + startOffset + (i * 0.12) + (echo * 0.06);
                            const osc = ctx.createOscillator(); const gain = ctx.createGain();
                            osc.type = 'triangle'; osc.frequency.setValueAtTime(freq, t);
                            gain.gain.setValueAtTime((0.15 / (echo + 1)) * volume, t);
                            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
                            osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.15);
                        }
                    });
                });
            } else if (tone === 'orquestra_sino') {
                const bellSequence = [
                    { offset: 0.0, freqs: [329.63, 392.00, 493.88] },
                    { offset: 1.6, freqs: [392.00, 493.88, 659.25] },
                    { offset: 3.2, freqs: [493.88, 587.33, 739.99] },
                    { offset: 4.8, freqs: [659.25, 783.99, 987.77, 1318.51] }
                ];
                bellSequence.forEach(item => {
                    item.freqs.forEach((freq, idx) => {
                        const t = startTime + item.offset + (idx * 0.06);
                        const osc = ctx.createOscillator(); const gain = ctx.createGain();
                        osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t);
                        gain.gain.setValueAtTime(0.14 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
                        osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 2.5);
                    });
                });
            } else if (tone === 'relogio_cucu') {
                [0, 2.4, 4.8].forEach(startOffset => {
                    [880, 700].forEach((freq, idx) => {
                        const t = startTime + startOffset + (idx * 0.22);
                        const osc = ctx.createOscillator(); const gain = ctx.createGain();
                        osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t);
                        gain.gain.setValueAtTime(0.20 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
                        osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.35);
                    });
                });
            } else if (tone === 'synthwave_80s') {
                const notes = [110, 146.83, 164.81, 220, 293.66, 329.63, 440, 587.33];
                for (let rep = 0; rep < 16; rep++) {
                    const freq = notes[rep % notes.length];
                    const t = startTime + (rep * 0.5);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.10 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.45);
                }
            } else if (tone === 'despertador_digital') {
                for (let bar = 0; bar < 6; bar++) {
                    [1000, 1000].forEach((freq, i) => {
                        const t = startTime + (bar * 1.2) + (i * 0.15);
                        const osc = ctx.createOscillator(); const gain = ctx.createGain();
                        osc.type = 'square'; osc.frequency.setValueAtTime(freq, t);
                        gain.gain.setValueAtTime(0.08 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
                        osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.10);
                    });
                }
            } else if (tone === 'caixinha_musica') {
                const melody = [523.25, 659.25, 783.99, 1046.50, 783.99, 659.25, 880.00, 1046.50, 1318.51, 1046.50];
                melody.forEach((freq, idx) => {
                    const t = startTime + (idx * 0.75);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.15 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 1.2);
                });
            } else if (tone === 'marimba_pop') {
                const freqs = [392.00, 523.25, 659.25, 783.99, 659.25, 523.25, 440.00, 523.25, 659.25, 783.99];
                freqs.forEach((freq, idx) => {
                    const t = startTime + (idx * 0.70);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.18 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.50);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.50);
                });
            } else if (tone === 'zen_gong') {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sine'; osc.frequency.setValueAtTime(164.81, startTime);
                gain.gain.setValueAtTime(0.25 * volume, startTime); gain.gain.exponentialRampToValueAtTime(0.001, startTime + 8.5);
                osc.connect(gain); gain.connect(ctx.destination); osc.start(startTime); osc.stop(startTime + 8.5);

                const osc2 = ctx.createOscillator(); const gain2 = ctx.createGain();
                osc2.type = 'sine'; osc2.frequency.setValueAtTime(329.63, startTime + 0.05);
                gain2.gain.setValueAtTime(0.15 * volume, startTime + 0.05); gain2.gain.exponentialRampToValueAtTime(0.001, startTime + 8.0);
                osc2.connect(gain2); gain2.connect(ctx.destination); osc2.start(startTime + 0.05); osc2.stop(startTime + 8.0);
            } else if (tone === 'game_over_8bit') {
                const notes = [440, 554.37, 659.25, 880, 739.99, 659.25, 554.37, 440, 330, 440];
                notes.forEach((freq, idx) => {
                    const t = startTime + (idx * 0.70);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'square'; osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.08 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.40);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.40);
                });
            } else if (tone === 'trompete_alvorada') {
                const freqs = [392, 523.25, 659.25, 392, 523.25, 659.25, 783.99, 659.25, 523.25];
                freqs.forEach((freq, idx) => {
                    const t = startTime + (idx * 0.80);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'triangle'; osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.18 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.65);
                });
            } else if (tone === 'sirene_emergencia') {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sawtooth';
                gain.gain.setValueAtTime(0.12 * volume, startTime); gain.gain.setValueAtTime(0.12 * volume, startTime + 6.8);
                gain.gain.linearRampToValueAtTime(0.001, startTime + 7.2);
                osc.frequency.setValueAtTime(600, startTime);
                for (let c = 0; c < 6; c++) {
                    const tBase = startTime + (c * 1.2);
                    osc.frequency.linearRampToValueAtTime(1200, tBase + 0.6);
                    osc.frequency.linearRampToValueAtTime(600, tBase + 1.2);
                }
                osc.connect(gain); gain.connect(ctx.destination); osc.start(startTime); osc.stop(startTime + 7.2);
            } else if (tone === 'piano_classico') {
                const chordNotes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50, 783.99, 659.25, 523.25];
                chordNotes.forEach((freq, idx) => {
                    const t = startTime + (idx * 0.75);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.16 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 1.5);
                });
            } else if (tone === 'cosmico_sci_fi') {
                for (let p = 0; p < 4; p++) {
                    const t = startTime + (p * 1.8);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(200, t);
                    osc.frequency.exponentialRampToValueAtTime(1600, t + 0.8);
                    gain.gain.setValueAtTime(0.15 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 1.4);
                }
            } else if (tone === 'flauta_magica') {
                const trills = [659.25, 783.99, 880.00, 1046.50, 1174.66, 1318.51];
                trills.forEach((freq, idx) => {
                    const t = startTime + (idx * 1.2);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.14 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.9);
                });
            } else if (tone === 'bateria_ritmo') {
                for (let beat = 0; beat < 8; beat++) {
                    const t = startTime + (beat * 0.9);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'triangle'; osc.frequency.setValueAtTime(beat % 2 === 0 ? 150 : 300, t);
                    gain.gain.setValueAtTime(0.20 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.3);
                }
            } else if (tone === 'balada_violao') {
                const strums = [
                    { offset: 0.0, freqs: [164.81, 246.94, 329.63, 392.00] },
                    { offset: 2.0, freqs: [174.61, 261.63, 349.23, 440.00] },
                    { offset: 4.0, freqs: [196.00, 293.66, 392.00, 493.88] },
                    { offset: 6.0, freqs: [164.81, 246.94, 329.63, 523.25] }
                ];
                strums.forEach(s => {
                    s.freqs.forEach((freq, i) => {
                        const t = startTime + s.offset + (i * 0.05);
                        const osc = ctx.createOscillator(); const gain = ctx.createGain();
                        osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t);
                        gain.gain.setValueAtTime(0.12 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
                        osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 1.8);
                    });
                });
            } else if (tone === 'galaxia_neon') {
                [220, 277.18, 329.63, 440, 554.37].forEach((freq, idx) => {
                    const t = startTime + (idx * 1.5);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.15 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 2.5);
                });
            } else if (tone === 'despertador_galactico') {
                for (let i = 0; i < 6; i++) {
                    const t = startTime + (i * 1.2);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(800 + (i * 150), t);
                    osc.frequency.linearRampToValueAtTime(1400, t + 0.6);
                    gain.gain.setValueAtTime(0.15 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.8);
                }
            } else if (tone === 'ritmo_samba') {
                const freqs = [180, 240, 320, 240, 360, 280, 180, 320];
                freqs.forEach((freq, idx) => {
                    const t = startTime + (idx * 0.9);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'triangle'; osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.22 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.4);
                });
            } else if (tone === 'sirene_bombeiro') {
                for (let i = 0; i < 4; i++) {
                    const t = startTime + (i * 1.8);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(400, t);
                    osc.frequency.linearRampToValueAtTime(1200, t + 0.9);
                    osc.frequency.linearRampToValueAtTime(400, t + 1.6);
                    gain.gain.setValueAtTime(0.12 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 1.6);
                }
            } else if (tone === 'fanfarra_circo') {
                const notes = [523.25, 659.25, 783.99, 1046.50, 783.99, 659.25, 523.25, 659.25];
                notes.forEach((freq, idx) => {
                    const t = startTime + (idx * 0.95);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'triangle'; osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.18 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.7);
                });
            } else if (tone === 'synth_cyberpunk') {
                for (let i = 0; i < 4; i++) {
                    const t = startTime + (i * 1.9);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(110 + (i * 55), t);
                    gain.gain.setValueAtTime(0.16 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 1.5);
                }
            } else if (tone === 'sinos_catedral') {
                [261.63, 329.63, 392.00, 523.25].forEach((freq, idx) => {
                    const t = startTime + (idx * 1.8);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.20 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 3.0);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 3.0);
                });
            } else if (tone === 'caixinha_caverna') {
                [880, 1046.50, 1318.51, 1567.98, 1760].forEach((freq, idx) => {
                    const t = startTime + (idx * 1.5);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.12 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 2.2);
                });
            } else if (tone === 'alarme_neon') {
                for (let i = 0; i < 8; i++) {
                    const t = startTime + (i * 0.9);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'square'; osc.frequency.setValueAtTime(i % 2 === 0 ? 1200 : 1600, t);
                    gain.gain.setValueAtTime(0.08 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.5);
                }
            } else if (tone === 'marcha_vitoria') {
                const notes = [392.00, 392.00, 392.00, 523.25, 659.25, 783.99];
                notes.forEach((freq, idx) => {
                    const t = startTime + (idx * 1.2);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'triangle'; osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.20 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.9);
                });
            } else if (tone === 'relogio_pendulo') {
                for (let i = 0; i < 8; i++) {
                    const t = startTime + (i * 0.95);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(i % 2 === 0 ? 400 : 350, t);
                    gain.gain.setValueAtTime(0.25 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.35);
                }
            } else if (tone === 'bateria_rock') {
                for (let i = 0; i < 8; i++) {
                    const t = startTime + (i * 0.9);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = i % 2 === 0 ? 'sine' : 'triangle';
                    osc.frequency.setValueAtTime(i % 2 === 0 ? 100 : 250, t);
                    gain.gain.setValueAtTime(0.22 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.4);
                }
            } else if (tone === 'flauta_andes') {
                const notes = [587.33, 659.25, 783.99, 880.00, 1046.50];
                notes.forEach((freq, idx) => {
                    const t = startTime + (idx * 1.5);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.14 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 1.3);
                });
            } else if (tone === 'radar_espacial') {
                for (let i = 0; i < 5; i++) {
                    const t = startTime + (i * 1.5);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(1500, t);
                    osc.frequency.exponentialRampToValueAtTime(300, t + 0.6);
                    gain.gain.setValueAtTime(0.16 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.9);
                }
            } else if (tone === 'despertador_galo') {
                for (let i = 0; i < 4; i++) {
                    const t = startTime + (i * 1.8);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(600, t);
                    osc.frequency.linearRampToValueAtTime(1100, t + 0.3);
                    osc.frequency.linearRampToValueAtTime(800, t + 0.8);
                    gain.gain.setValueAtTime(0.12 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.9);
                }
            } else if (tone === 'jazz_bebop') {
                const notes = [311.13, 369.99, 415.30, 466.16, 554.37, 622.25];
                notes.forEach((freq, idx) => {
                    const t = startTime + (idx * 1.25);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'triangle'; osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.18 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.9);
                });
            } else if (tone === 'chuva_trovao') {
                for (let i = 0; i < 4; i++) {
                    const t = startTime + (i * 2.0);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(80, t);
                    osc.frequency.exponentialRampToValueAtTime(40, t + 1.5);
                    gain.gain.setValueAtTime(0.25 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 1.8);
                }
            } else if (tone === 'arcade_hero') {
                const freqs = [440, 554.37, 659.25, 880, 659.25, 880];
                freqs.forEach((freq, idx) => {
                    const t = startTime + (idx * 1.15);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'square'; osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.08 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.6);
                });
            } else if (tone === 'violoncelo_suave') {
                const notes = [130.81, 164.81, 196.00, 261.63];
                notes.forEach((freq, idx) => {
                    const t = startTime + (idx * 1.9);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.12 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 2.2);
                });
            } else if (tone === 'trompete_regimento') {
                const notes = [293.66, 369.99, 440.00, 587.33];
                notes.forEach((freq, idx) => {
                    const t = startTime + (idx * 1.8);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'triangle'; osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.20 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 1.4);
                });
            } else if (tone === 'carillon_sinos') {
                [523.25, 659.25, 783.99, 987.77, 1046.50].forEach((freq, idx) => {
                    const t = startTime + (idx * 1.5);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.18 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 2.5);
                });
            } else if (tone === 'emergencia_submarino') {
                for (let i = 0; i < 5; i++) {
                    const t = startTime + (i * 1.5);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(440, t);
                    osc.frequency.linearRampToValueAtTime(880, t + 0.4);
                    gain.gain.setValueAtTime(0.18 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.8);
                }
            } else if (tone === 'bossa_nova') {
                const notes = [261.63, 329.63, 392.00, 493.88, 523.25];
                notes.forEach((freq, idx) => {
                    const t = startTime + (idx * 1.5);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.15 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 1.8);
                });
            } else if (tone === 'synth_funk') {
                const freqs = [110, 146.83, 164.81, 220, 146.83, 220];
                freqs.forEach((freq, idx) => {
                    const t = startTime + (idx * 1.25);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.14 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.9);
                });
            } else if (tone === 'sinos_tibetanos') {
                [216, 432, 648, 864].forEach((freq, idx) => {
                    const t = startTime + (idx * 1.9);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.18 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 3.2);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 3.2);
                });
            } else if (tone === 'chefe_8bit') {
                for (let i = 0; i < 7; i++) {
                    const t = startTime + (i * 1.0);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'square'; osc.frequency.setValueAtTime(150 + (i * 100), t);
                    gain.gain.setValueAtTime(0.09 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.6);
                }
            } else if (tone === 'orgao_majestoso') {
                const chord = [130.81, 164.81, 196.00, 261.63, 329.63];
                for (let i = 0; i < 3; i++) {
                    const t = startTime + (i * 2.5);
                    chord.forEach(freq => {
                        const osc = ctx.createOscillator(); const gain = ctx.createGain();
                        osc.type = 'triangle'; osc.frequency.setValueAtTime(freq * (1 + i * 0.25), t);
                        gain.gain.setValueAtTime(0.06 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
                        osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 2.2);
                    });
                }
            } else if (tone === 'trem_vapor') {
                for (let i = 0; i < 4; i++) {
                    const t = startTime + (i * 1.8);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(350, t);
                    osc.frequency.linearRampToValueAtTime(450, t + 0.5);
                    gain.gain.setValueAtTime(0.12 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 1.2);
                }
            } else if (tone === 'harpa_celestial') {
                const freqs = [523.25, 659.25, 783.99, 987.77, 1046.50, 1318.51];
                freqs.forEach((freq, idx) => {
                    const t = startTime + (idx * 1.3);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.16 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 2.4);
                });
            } else if (tone === 'sirene_scifi') {
                for (let i = 0; i < 5; i++) {
                    const t = startTime + (i * 1.5);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(300, t);
                    osc.frequency.exponentialRampToValueAtTime(2400, t + 0.8);
                    gain.gain.setValueAtTime(0.14 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 1.1);
                }
            } else if (tone === 'sinfonia_alegre') {
                const notes = [523.25, 659.25, 783.99, 1046.50, 880.00, 1046.50];
                notes.forEach((freq, idx) => {
                    const t = startTime + (idx * 1.25);
                    const osc = ctx.createOscillator(); const gain = ctx.createGain();
                    osc.type = 'triangle'; osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.18 * volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
                    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 1.5);
                });
            }
        };

        await runLembreteAudio();

        if (isLoop) {
            lembreteLoopInterval = setInterval(() => {
                runLembreteAudio();
            }, 8500);
        }
    } catch (e) {
        console.error('Audio feedback error (Lembretes):', e);
    }
}
window.playLembreteSound = playLembreteSound;

// ==========================================
// MÓDULO NOTIFICAÇÕES (LIMPEZA DIÁRIA ÀS 00:00)
// ==========================================
async function persistNotificacoes() {
    const sKey = getCurrentUserStorageKey('cd_notificacoes');
    const dbId = getCurrentUserSupabaseId('notificacoes');
    try {
        localStorage.setItem(sKey, JSON.stringify(notificacoes || []));
    } catch(e) {}
    try {
        await supabaseClient.from('configuracoes').upsert([{ id: dbId, dados: { lista: notificacoes || [] } }]);
    } catch (e) {
        console.warn('Erro ao sincronizar notificacoes pessoais:', e);
    }
}
window.persistNotificacoes = persistNotificacoes;

function autoPurgeOldNotificacoes() {
    const now = Date.now();
    const dias = (configuracoes && configuracoes.tempoNotificacoesDias) ? Number(configuracoes.tempoNotificacoesDias) : 7;
    const maxAgeMs = dias * 24 * 60 * 60 * 1000;

    if (!notificacoes || !Array.isArray(notificacoes)) return;

    const initialCount = notificacoes.length;
    notificacoes = notificacoes.filter(n => {
        let createdMs = n.timestamp;
        if (!createdMs && n.data) {
            createdMs = new Date(n.data).getTime();
        }
        return createdMs && !isNaN(createdMs) && (now - createdMs) <= maxAgeMs;
    });

    if (notificacoes.length !== initialCount) {
        if (typeof renderNotificacoes === 'function') renderNotificacoes();
        persistNotificacoes();
    }
}
window.autoPurgeOldNotificacoes = autoPurgeOldNotificacoes;
setInterval(autoPurgeOldNotificacoes, 60000);

function fetchNotificacoes() {
    const sKey = getCurrentUserStorageKey('cd_notificacoes');
    const dbId = getCurrentUserSupabaseId('notificacoes');
    try {
        const local = localStorage.getItem(sKey);
        if (local) notificacoes = JSON.parse(local);
    } catch(e) {}
    renderNotificacoes();

    supabaseClient.from('configuracoes').select('*').eq('id', dbId).maybeSingle().then(({ data, error }) => {
        if (data && data.dados && Array.isArray(data.dados.lista)) {
            notificacoes = data.dados.lista;
            try {
                localStorage.setItem(sKey, JSON.stringify(notificacoes));
            } catch(e) {}
        }
        autoPurgeOldNotificacoes();
        renderNotificacoes();
    }).catch(() => {
        autoPurgeOldNotificacoes();
        renderNotificacoes();
    });
}
window.fetchNotificacoes = fetchNotificacoes;

function criarNotificacao(mensagem, pagina) {
    const nowMs = Date.now();
    if (notificacoes && Array.isArray(notificacoes) && notificacoes.length > 0) {
        const ultima = notificacoes[0];
        if (ultima && ultima.mensagem === mensagem && (nowMs - (ultima.timestamp || 0)) < 1500) {
            return;
        }
    }
    const nova = {
        id: String(nowMs),
        mensagem: mensagem,
        pagina: pagina || (typeof getCurrentPageLabel === 'function' ? getCurrentPageLabel() : 'Sistema'),
        data: new Date().toISOString(),
        timestamp: nowMs
    };
    notificacoes.unshift(nova);
    renderNotificacoes();
    persistNotificacoes();
}
window.criarNotificacao = criarNotificacao;

function getNotificacoesValidas() {
    autoPurgeOldNotificacoes();
    return notificacoes || [];
}

function renderNotificacoes() {
    const tbody = document.getElementById('notificacoesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const validNotifs = getNotificacoesValidas();
    const btnLimpar = document.getElementById('btnLimparTodasNotificacoes');
    if (btnLimpar) {
        const hasNotifs = validNotifs && validNotifs.length > 0;
        btnLimpar.disabled = !hasNotifs;
        btnLimpar.style.opacity = hasNotifs ? '1' : '0.4';
        btnLimpar.style.cursor = hasNotifs ? 'pointer' : 'not-allowed';
    }

    const searchQuery = (document.getElementById('inputBuscarNotificacao')?.value || '').toLowerCase();

    let filtered = validNotifs;
    if (searchQuery) {
        filtered = filtered.filter(n =>
            (n.mensagem && n.mensagem.toLowerCase().includes(searchQuery)) ||
            (n.pagina && n.pagina.toLowerCase().includes(searchQuery))
        );
    }

    if (filtered.length === 0) {
        const emptyTr = document.createElement('tr');
        emptyTr.className = 'empty-state-row';
        emptyTr.innerHTML = `
            <td colspan="4" class="empty-state-cell">
                <i class="ph ph-magnifying-glass"></i>
                <span>Nenhuma notificação encontrada.</span>
            </td>
        `;
        tbody.appendChild(emptyTr);
        renderPagination('paginationNotificacoesContainer', 'notificacoes', 0, 15, renderNotificacoes);
        return;
    }

    const limit = (personalConfig && personalConfig.limiteLinhas && personalConfig.limiteLinhas.notificacoes)
        ? parseInt(personalConfig.limiteLinhas.notificacoes, 10)
        : ((configuracoes && configuracoes.limiteLinhas && configuracoes.limiteLinhas.notificacoes) ? parseInt(configuracoes.limiteLinhas.notificacoes, 10) : 50);
    const totalPages = Math.ceil(filtered.length / limit) || 1;
    if (!paginationState.notificacoes || isNaN(paginationState.notificacoes) || paginationState.notificacoes < 1) {
        paginationState.notificacoes = 1;
    }
    if (paginationState.notificacoes > totalPages) paginationState.notificacoes = totalPages;
    const start = (paginationState.notificacoes - 1) * limit;
    const paged = filtered.slice(start, start + limit);

    paged.forEach(n => {
        const tr = document.createElement('tr');

        let dataStr = '-';
        const dateObj = new Date(n.data || n.timestamp);
        if (!isNaN(dateObj.getTime())) {
            const dia = String(dateObj.getDate()).padStart(2, '0');
            const mes = String(dateObj.getMonth() + 1).padStart(2, '0');
            const ano = dateObj.getFullYear();
            const hora = String(dateObj.getHours()).padStart(2, '0');
            const min = String(dateObj.getMinutes()).padStart(2, '0');
            dataStr = `${dia}/${mes}/${ano} ${hora}:${min}`;
        }

        tr.innerHTML = `
            <td style="text-align: center;"><span style="font-size: 13px; color: var(--text-sidebar); font-weight: 500;">${dataStr}</span></td>
            <td style="text-align: center;"><strong style="color: var(--text-main); font-weight: 500;">${n.mensagem}</strong></td>
            <td style="text-align: center;"><span class="badge badge-editor" style="padding: 6px 14px; font-size: 12px; display: inline-block;">${n.pagina || 'Geral'}</span></td>
            <td style="text-align: center;">
                <button class="action-btn delete" onclick="window.deletarNotificacao('${n.id}')" title="Dispensar">
                    <i class="ph ph-x"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    renderPagination('paginationNotificacoesContainer', 'notificacoes', filtered.length, limit, renderNotificacoes);
}
window.renderNotificacoes = renderNotificacoes;

window.deletarNotificacao = async (id) => {
    notificacoes = notificacoes.filter(n => String(n.id) !== String(id));
    renderNotificacoes();
    try {
        await persistNotificacoes();
        showToast('Notificação dispensada', 'success', false);
    } catch (e) {
        console.error(e);
    }
};

window.limparNotificacoes = async () => {
    notificacoes = [];
    renderNotificacoes();
    if (typeof playSuccessSound === 'function') playSuccessSound();
    try {
        await persistNotificacoes();
        showToast('Todas as notificações foram limpas', 'success', false);
    } catch (e) {
        console.error(e);
    }
};

document.getElementById('inputBuscarNotificacao')?.addEventListener('input', () => renderNotificacoes());
document.getElementById('btnLimparTodasNotificacoes')?.addEventListener('click', () => window.limparNotificacoes());
document.getElementById('btnResetNotificacoes')?.addEventListener('click', () => {
    const inp = document.getElementById('inputBuscarNotificacao');
    if (inp) inp.value = '';
    renderNotificacoes();
});

// ==========================================
// MÓDULO CONFIGURAÇÕES (PAGINAÇÃO, TEMA & SOM)
// ==========================================
window.checkLimitChanged = (key, savedVal) => {
    const input = document.getElementById(`inputLimit_${key}`);
    const btn = document.getElementById(`btnSaveLimit_${key}`);
    if (!input || !btn) return;

    const val = parseInt(input.value, 10);
    const hasChanged = !isNaN(val) && val !== savedVal;

    if (hasChanged) {
        btn.disabled = false;
        btn.classList.add('active-save');
        btn.title = 'Salvar alteração';
    } else {
        btn.disabled = true;
        btn.classList.remove('active-save');
        btn.title = 'Nenhuma alteração para salvar';
    }
};

function renderConfiguracoes() {
    // 1. Configuração do Tema (Toggle Switch)
    const themeCheckbox = document.getElementById('themeToggleCheckbox');
    const themeIcon = document.getElementById('themeToggleIcon');
    const themeText = document.getElementById('themeToggleText');
    const themeSubtext = document.getElementById('themeToggleSubtext');
    const themeKnob = document.getElementById('themeToggleKnob');
    const themeKnobIcon = document.getElementById('themeToggleKnobIcon');

    const updateThemeUI = (isLight) => {
        if (themeCheckbox) themeCheckbox.checked = isLight;
        if (isLight) {
            if (themeIcon) { themeIcon.className = 'ph ph-sun'; themeIcon.style.color = '#f59e0b'; }
            if (themeText) themeText.textContent = 'Modo Claro';
            if (themeSubtext) themeSubtext.textContent = 'Tema com fundo claro e visual limpo';
            if (themeKnob) themeKnob.style.transform = 'translateX(24px)';
            if (themeKnobIcon) { themeKnobIcon.className = 'ph ph-sun'; themeKnobIcon.style.color = '#f59e0b'; }
        } else {
            if (themeIcon) { themeIcon.className = 'ph ph-moon'; themeIcon.style.color = '#8b5cf6'; }
            if (themeText) themeText.textContent = 'Modo Escuro';
            if (themeSubtext) themeSubtext.textContent = 'Tema com alto contraste visual e tons escuros';
            if (themeKnob) themeKnob.style.transform = 'translateX(0px)';
            if (themeKnobIcon) { themeKnobIcon.className = 'ph ph-moon'; themeKnobIcon.style.color = '#6d28d9'; }
        }
    };

    const isLight = document.documentElement.classList.contains('light-mode');
    updateThemeUI(isLight);

    if (themeCheckbox && !themeCheckbox._listener) {
        themeCheckbox._listener = true;
        themeCheckbox.addEventListener('change', async (e) => {
            const checked = e.target.checked;
            if (checked) {
                document.documentElement.classList.add('light-mode');
                localStorage.setItem('theme', 'light');
                personalConfig.theme = 'light';
                updateThemeUI(true);
            } else {
                document.documentElement.classList.remove('light-mode');
                localStorage.setItem('theme', 'dark');
                personalConfig.theme = 'dark';
                updateThemeUI(false);
            }
            await savePersonalConfig();
        });
    }

    // 2. Limite de linhas por página (Configuração Pessoal)
    const tbody = document.getElementById('limiteLinhasTableBody');
    if (tbody) {
        if (!personalConfig.limiteLinhas) {
            personalConfig.limiteLinhas = {
                abertas: 50,
                historico: 50,
                guias: 10,
                controle: 25,
                lembretes: 10,
                notificacoes: 50,
                acessos: 10
            };
        }

        const modulos = [
            { key: 'abertas', label: 'Demandas em Aberto', default: 50, max: 100 },
            { key: 'historico', label: 'Demandas Encerradas (Histórico)', default: 50, max: 100 },
            { key: 'guias', label: 'Tutoriais', default: 10, max: 50 },
            { key: 'controle', label: 'Controle', default: 25, max: 50 },
            { key: 'lembretes', label: 'Lembretes', default: 10, max: 50 },
            { key: 'notificacoes', label: 'Notificações', default: 50, max: 100 },
            { key: 'acessos', label: 'Acessos', default: 10, max: 50 }
        ];

        tbody.innerHTML = '';
        modulos.forEach(m => {
            const val = (personalConfig.limiteLinhas && personalConfig.limiteLinhas[m.key] !== undefined)
                ? personalConfig.limiteLinhas[m.key]
                : ((configuracoes && configuracoes.limiteLinhas && configuracoes.limiteLinhas[m.key] !== undefined)
                    ? configuracoes.limiteLinhas[m.key]
                    : m.default);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${m.label}</strong> <span style="font-size: 11px; color: var(--text-sidebar); font-weight: normal;">(máx. ${m.max})</span></td>
                <td style="text-align: center;">
                    <input type="number" id="inputLimit_${m.key}" min="1" max="${m.max}" value="${val}"
                           oninput="window.checkLimitChanged('${m.key}', ${val})"
                           onkeydown="if(event.key === 'Enter'){ event.preventDefault(); window.salvarLimiteLinhasModulo('${m.key}'); }"
                           style="width: 85px; padding: 6px 10px; background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 6px; text-align: center; font-weight: 600; outline: none;">
                </td>
                <td style="text-align: center;">
                    <button class="action-btn edit btn-limit-save" id="btnSaveLimit_${m.key}" disabled onclick="salvarLimiteLinhasModulo('${m.key}')" title="Nenhuma alteração para salvar">
                        <i class="ph ph-floppy-disk"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function updateVolumeSliderTrack(sliderEl, accentColor) {
        if (!sliderEl) return;
        const val = parseInt(sliderEl.value || 0, 10);
        sliderEl.style.background = `linear-gradient(to right, ${accentColor} 0%, ${accentColor} ${val}%, #3b3251 ${val}%, #3b3251 100%)`;
    }

    // 3. Configurações de som (Notificações - Pessoal)
    const inputVol = document.getElementById('inputSoundVolume');
    const labelVol = document.getElementById('soundVolumeLabel');
    const selectTone = document.getElementById('selectSoundTone');

    const soundVol = (personalConfig.soundVolume !== undefined) ? personalConfig.soundVolume : 100;
    const soundTone = personalConfig.soundTone || 'padrao';

    if (inputVol) {
        inputVol.value = soundVol;
        updateVolumeSliderTrack(inputVol, '#8b5cf6');
    }
    if (labelVol) labelVol.textContent = soundVol + '%';
    if (selectTone) selectTone.value = soundTone;

    if (inputVol && !inputVol._soundListener) {
        inputVol._soundListener = true;
        inputVol.addEventListener('input', (e) => {
            const v = parseInt(e.target.value, 10);
            updateVolumeSliderTrack(e.target, '#8b5cf6');
            if (labelVol) labelVol.textContent = v + '%';
            personalConfig.soundVolume = v;
            savePersonalConfig();
        });
    }

    if (selectTone && !selectTone._soundListener) {
        selectTone._soundListener = true;
        selectTone.addEventListener('change', (e) => {
            stopNotificationSound();
            personalConfig.soundTone = e.target.value;
            savePersonalConfig();
        });
    }

    const btnTest = document.getElementById('btnTestSound');
    if (btnTest && !btnTest._soundListener) {
        btnTest._soundListener = true;
        btnTest.addEventListener('click', () => {
            if (btnTest.classList.contains('is-playing')) {
                stopNotificationSound();
            } else {
                stopLembreteSound();
                const v = parseInt(document.getElementById('inputSoundVolume')?.value || 100, 10);
                const t = document.getElementById('selectSoundTone')?.value || 'padrao';
                playSuccessSound(t, v, true);
            }
        });
    }

    // 4. Configurações de som (Lembretes - Pessoal)
    const inputLembreteVol = document.getElementById('inputLembreteSoundVolume');
    const labelLembreteVol = document.getElementById('soundLembreteVolumeLabel');
    const selectLembreteTone = document.getElementById('selectLembreteSoundTone');

    const lembreteSoundVol = (personalConfig.lembreteSoundVolume !== undefined) ? personalConfig.lembreteSoundVolume : 100;
    const lembreteSoundTone = personalConfig.lembreteSoundTone || 'alarme_despertador';

    if (inputLembreteVol) {
        inputLembreteVol.value = lembreteSoundVol;
        updateVolumeSliderTrack(inputLembreteVol, '#f59e0b');
    }
    if (labelLembreteVol) labelLembreteVol.textContent = lembreteSoundVol + '%';
    if (selectLembreteTone) selectLembreteTone.value = lembreteSoundTone;

    if (inputLembreteVol && !inputLembreteVol._soundListener) {
        inputLembreteVol._soundListener = true;
        inputLembreteVol.addEventListener('input', (e) => {
            const v = parseInt(e.target.value, 10);
            updateVolumeSliderTrack(e.target, '#f59e0b');
            if (labelLembreteVol) labelLembreteVol.textContent = v + '%';
            personalConfig.lembreteSoundVolume = v;
            savePersonalConfig();
        });
    }

    if (selectLembreteTone && !selectLembreteTone._soundListener) {
        selectLembreteTone._soundListener = true;
        selectLembreteTone.addEventListener('change', (e) => {
            stopLembreteSound();
            personalConfig.lembreteSoundTone = e.target.value;
            savePersonalConfig();
        });
    }

    const btnTestLembrete = document.getElementById('btnTestLembreteSound');
    if (btnTestLembrete && !btnTestLembrete._soundListener) {
        btnTestLembrete._soundListener = true;
        btnTestLembrete.addEventListener('click', () => {
            if (btnTestLembrete.classList.contains('is-playing')) {
                stopLembreteSound();
            } else {
                stopNotificationSound();
                const v = parseInt(document.getElementById('inputLembreteSoundVolume')?.value || 100, 10);
                const t = document.getElementById('selectLembreteSoundTone')?.value || 'alarme_despertador';
                playLembreteSound(t, v, true);
            }
        });
    }
}

window.renderConfiguracoes = renderConfiguracoes;

window.salvarLimiteLinhasModulo = async (key) => {
    const input = document.getElementById(`inputLimit_${key}`);
    const btn = document.getElementById(`btnSaveLimit_${key}`);
    if (!input) return;

    const modulosList = [
        { key: 'abertas', label: 'Demandas em Aberto', default: 50, max: 100 },
        { key: 'historico', label: 'Demandas Encerradas (Histórico)', default: 50, max: 100 },
        { key: 'guias', label: 'Tutoriais', default: 10, max: 50 },
        { key: 'controle', label: 'Controle', default: 25, max: 50 },
        { key: 'lembretes', label: 'Lembretes', default: 10, max: 50 },
        { key: 'notificacoes', label: 'Notificações', default: 50, max: 100 },
        { key: 'acessos', label: 'Acessos', default: 10, max: 50 }
    ];
    const modDef = modulosList.find(m => m.key === key) || { max: 100, label: key };

    let newVal = parseInt(input.value, 10);
    if (isNaN(newVal) || newVal < 1) {
        showToast('Informe um número válido de linhas (mínimo 1)', 'error');
        return;
    }

    if (newVal > modDef.max) {
        showToast(`Valor superior ao limite aceito! O limite máximo para "${modDef.label}" é ${modDef.max} linhas.`, 'warning');
        newVal = modDef.max;
        input.value = modDef.max;
    }

    if (!personalConfig.limiteLinhas) personalConfig.limiteLinhas = {};
    personalConfig.limiteLinhas[key] = newVal;

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';
        }

        await savePersonalConfig();
        showToast('Seu limite pessoal de linhas foi atualizado', 'success');
        if (typeof playSuccessSound === 'function') playSuccessSound();

        // Update row input state without destroying other rows being edited
        input.setAttribute('oninput', `window.checkLimitChanged('${key}', ${newVal})`);
        if (btn) {
            btn.disabled = true;
            btn.classList.remove('active-save');
            btn.title = 'Nenhuma alteração para salvar';
            btn.innerHTML = '<i class="ph ph-floppy-disk"></i>';
        }

        if (typeof renderTables === 'function') renderTables();
        if (typeof renderGuias === 'function') renderGuias();
        if (typeof renderControleTable === 'function') renderControleTable();
        if (typeof renderLembretes === 'function') renderLembretes();
        if (typeof renderNotificacoes === 'function') renderNotificacoes();
        if (typeof renderUsuarios === 'function') renderUsuarios();
    } catch (err) {
        console.error(err);
        showToast('Erro ao salvar limite', 'error');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="ph ph-floppy-disk"></i>';
        }
    }
};
