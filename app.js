/* ==========================================================================
   TaskFlow - Sistema de Controle de Demandas Diárias
   Application Logic & State Management
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  // --- STATE MANAGEMENT ---
  const STORAGE_KEY = 'taskflow_demands_v1';
  let demands = [];
  let currentView = 'kanban';
  let currentSearch = '';
  let currentPriorityFilter = 'all';
  let currentCategoryFilter = 'all';
  let modalSubtasks = [];
  let dragSrcEl = null;

  // Pomodoro State
  let pomodoroInterval = null;
  let pomodoroTimeLeft = 25 * 60; // 25 minutes
  let pomodoroIsRunning = false;
  let pomodoroActiveDemandId = null;

  // --- SAMPLE INITIAL DATA ---
  const initialSampleDemands = [
    {
      id: 'dem-1',
      title: 'Elaborar Relatório de Entregas Trimestrais',
      description: 'Compilar métricas de desempenho da equipe, gráficos de vazão de projetos e apresentar à diretoria.',
      priority: 'urgente',
      category: 'Trabalho',
      status: 'in-progress',
      deadline: new Date(Date.now() + 86400000).toISOString().split('T')[0], // amanhã
      subtasks: [
        { text: 'Extrair dados do sistema', done: true },
        { text: 'Montar gráficos de produtividade', done: true },
        { text: 'Revisar texto final', done: false }
      ],
      createdAt: new Date().toISOString()
    },
    {
      id: 'dem-2',
      title: 'Revisão de Código - Pull Request #402',
      description: 'Analisar arquitetura de componentes do novo módulo de autenticação e testar rotas seguras.',
      priority: 'alta',
      category: 'Trabalho',
      status: 'todo',
      deadline: new Date(Date.now() + 172800000).toISOString().split('T')[0],
      subtasks: [
        { text: 'Validar testes unitários', done: false },
        { text: 'Verificar boas práticas de segurança', done: false }
      ],
      createdAt: new Date().toISOString()
    },
    {
      id: 'dem-3',
      title: 'Estudo do Framework Next.js 15 & Server Actions',
      description: 'Assistir aos módulos avançados do curso e construir uma aplicação modelo com rotas paralelas.',
      priority: 'media',
      category: 'Estudos',
      status: 'in-progress',
      deadline: new Date(Date.now() + 432000000).toISOString().split('T')[0],
      subtasks: [
        { text: 'Concluir Módulo 3', done: true },
        { text: 'Criar protótipo prático', done: false }
      ],
      createdAt: new Date().toISOString()
    },
    {
      id: 'dem-4',
      title: 'Organizar Arquivos Financeiros do Mês',
      description: 'Classificar comprovantes de despesas, conciliar extrato bancário e enviar ao contabilidade.',
      priority: 'alta',
      category: 'Finanças',
      status: 'review',
      deadline: new Date(Date.now() - 86400000).toISOString().split('T')[0], // ontem (atrasado)
      subtasks: [
        { text: 'Baixar extratos em PDF', done: true },
        { text: 'Categorizar planilhas', done: true }
      ],
      createdAt: new Date().toISOString()
    },
    {
      id: 'dem-5',
      title: 'Planejar Treino e Rotina Semanal de Saúde',
      description: 'Definir agenda de exercícios aeróbicos e preparar marmitas balanceadas para a semana.',
      priority: 'baixa',
      category: 'Saúde',
      status: 'completed',
      deadline: new Date().toISOString().split('T')[0],
      subtasks: [
        { text: 'Montar ficha de treino', done: true },
        { text: 'Fazer compras no mercado', done: true }
      ],
      createdAt: new Date().toISOString()
    }
  ];

  // --- LOCALSTORAGE LOAD / SAVE ---
  function loadDemands() {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      try {
        demands = JSON.parse(data);
      } catch (e) {
        console.error('Erro ao ler do localStorage, carregando exemplos:', e);
        demands = initialSampleDemands;
      }
    } else {
      demands = initialSampleDemands;
      saveDemands();
    }
  }

  function saveDemands() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(demands));
    renderApp();
  }

  // --- RENDER APP MAIN ROUTINER ---
  function renderApp() {
    renderKanbanView();
    renderListView();
    renderDashboardView();
    updateSidebarProgress();
  }

  // --- FILTER HELPER ---
  function getFilteredDemands() {
    return demands.filter(item => {
      const matchesSearch = currentSearch === '' || 
        item.title.toLowerCase().includes(currentSearch.toLowerCase()) ||
        item.description.toLowerCase().includes(currentSearch.toLowerCase()) ||
        item.category.toLowerCase().includes(currentSearch.toLowerCase());
      
      const matchesPriority = currentPriorityFilter === 'all' || item.priority === currentPriorityFilter;
      const matchesCategory = currentCategoryFilter === 'all' || item.category.toLowerCase() === currentCategoryFilter.toLowerCase();

      return matchesSearch && matchesPriority && matchesCategory;
    });
  }

  // --- KANBAN VIEW RENDER ---
  function renderKanbanView() {
    const filtered = getFilteredDemands();
    const columns = {
      'todo': document.getElementById('container-todo'),
      'in-progress': document.getElementById('container-in-progress'),
      'review': document.getElementById('container-review'),
      'completed': document.getElementById('container-completed')
    };

    const counts = {
      'todo': document.getElementById('count-todo'),
      'in-progress': document.getElementById('count-in-progress'),
      'review': document.getElementById('count-review'),
      'completed': document.getElementById('count-completed')
    };

    // Limpar containers
    Object.values(columns).forEach(col => col.innerHTML = '');
    
    const statusCounts = { 'todo': 0, 'in-progress': 0, 'review': 0, 'completed': 0 };

    filtered.forEach(demand => {
      if (statusCounts[demand.status] !== undefined) {
        statusCounts[demand.status]++;
      }
      
      const cardEl = createDemandCard(demand);
      if (columns[demand.status]) {
        columns[demand.status].appendChild(cardEl);
      }
    });

    // Atualizar badges
    Object.keys(counts).forEach(status => {
      counts[status].textContent = statusCounts[status] || 0;
    });

    document.getElementById('badge-kanban-count').textContent = filtered.length;

    setupDragAndDrop();
  }

  // --- CARD GENERATOR ---
  function createDemandCard(demand) {
    const card = document.createElement('div');
    card.className = 'demand-card';
    card.setAttribute('draggable', 'true');
    card.dataset.id = demand.id;

    // Subtasks Progress
    const totalSub = demand.subtasks ? demand.subtasks.length : 0;
    const completedSub = demand.subtasks ? demand.subtasks.filter(s => s.done).length : 0;
    const progressPercent = totalSub > 0 ? Math.round((completedSub / totalSub) * 100) : 0;

    // Deadline calculations
    let deadlineHtml = '';
    if (demand.deadline) {
      const todayStr = new Date().toISOString().split('T')[0];
      const isOverdue = demand.deadline < todayStr && demand.status !== 'completed';
      const isToday = demand.deadline === todayStr && demand.status !== 'completed';
      
      let deadlineClass = '';
      if (isOverdue) deadlineClass = 'overdue';
      else if (isToday) deadlineClass = 'today';

      const formattedDate = new Date(demand.deadline + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      deadlineHtml = `
        <div class="card-deadline ${deadlineClass}">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>${isOverdue ? 'Atrasado: ' : ''}${formattedDate}</span>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="card-top">
        <div class="badge-group">
          <span class="badge-priority ${demand.priority}">${demand.priority}</span>
          ${demand.category ? `<span class="badge-category">${demand.category}</span>` : ''}
        </div>
        <div class="card-actions-menu">
          <button class="card-menu-btn btn-edit-card" title="Editar Demanda">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button class="card-menu-btn btn-delete-card" title="Excluir Demanda" style="color: var(--priority-urgente);">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      <h4 class="card-title">${escapeHtml(demand.title)}</h4>
      ${demand.description ? `<p class="card-description">${escapeHtml(demand.description)}</p>` : ''}

      ${totalSub > 0 ? `
        <div class="card-progress-box">
          <div class="card-progress-info">
            <span>Checklist</span>
            <span>${completedSub}/${totalSub} (${progressPercent}%)</span>
          </div>
          <div class="card-progress-bar">
            <div class="card-progress-fill" style="width: ${progressPercent}%;"></div>
          </div>
        </div>
      ` : ''}

      <div class="card-footer">
        ${deadlineHtml || '<div></div>'}
        <button class="card-pomodoro-btn" title="Focar nesta demanda no Timer">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          </svg>
          Foco
        </button>
      </div>
    `;

    // Event Listeners no Card
    card.querySelector('.btn-edit-card').addEventListener('click', (e) => {
      e.stopPropagation();
      openModalForEdit(demand.id);
    });

    card.querySelector('.btn-delete-card').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Deseja realmente excluir a demanda "${demand.title}"?`)) {
        deleteDemand(demand.id);
      }
    });

    card.querySelector('.card-pomodoro-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      attachToPomodoro(demand);
    });

    return card;
  }

  // --- DRAG AND DROP KANBAN ---
  function setupDragAndDrop() {
    const cards = document.querySelectorAll('.demand-card');
    const containers = document.querySelectorAll('.cards-container');

    cards.forEach(card => {
      card.addEventListener('dragstart', (e) => {
        dragSrcEl = card;
        card.classList.add('dragging');
        e.dataTransfer.setData('text/plain', card.dataset.id);
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
      });
    });

    containers.forEach(container => {
      container.addEventListener('dragover', (e) => {
        e.preventDefault();
        container.classList.add('drag-over');
      });

      container.addEventListener('dragleave', () => {
        container.classList.remove('drag-over');
      });

      container.addEventListener('drop', (e) => {
        e.preventDefault();
        container.classList.remove('drag-over');
        const demandId = e.dataTransfer.getData('text/plain');
        const newStatus = container.parentElement.dataset.status;

        if (demandId && newStatus) {
          updateDemandStatus(demandId, newStatus);
        }
      });
    });
  }

  function updateDemandStatus(id, newStatus) {
    const target = demands.find(d => d.id === id);
    if (target && target.status !== newStatus) {
      target.status = newStatus;
      if (newStatus === 'completed') {
        playCelebrationEffect();
      }
      saveDemands();
    }
  }

  // --- LIST VIEW RENDER ---
  function renderListView() {
    const filtered = getFilteredDemands();
    const container = document.getElementById('list-rows-container');
    container.innerHTML = '';

    if (filtered.length === 0) {
      container.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-dim);">Nenhuma demanda encontrada para os filtros selecionados.</div>`;
      return;
    }

    filtered.forEach(demand => {
      const isCompleted = demand.status === 'completed';
      const totalSub = demand.subtasks ? demand.subtasks.length : 0;
      const completedSub = demand.subtasks ? demand.subtasks.filter(s => s.done).length : 0;

      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `
        <div class="custom-checkbox ${isCompleted ? 'checked' : ''}" title="Alternar conclusão">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div class="list-title-box">
          <span class="list-title ${isCompleted ? 'completed' : ''}">${escapeHtml(demand.title)}</span>
          <span class="list-desc">${escapeHtml(demand.description || '')}</span>
        </div>

        <div>
          <span class="badge-priority ${demand.priority}">${demand.priority}</span>
        </div>

        <div>
          <span class="badge-category">${demand.category || 'Geral'}</span>
        </div>

        <div style="font-size: 0.85rem; color: var(--text-muted);">
          ${demand.deadline ? new Date(demand.deadline + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
        </div>

        <div style="font-size: 0.85rem; color: var(--text-dim);">
          ${totalSub > 0 ? `${completedSub}/${totalSub}` : '-'}
        </div>

        <div style="display: flex; gap: 0.5rem;">
          <button class="btn-icon btn-edit-list" title="Editar">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button class="btn-icon btn-delete-list" title="Excluir" style="color: var(--priority-urgente);">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      `;

      row.querySelector('.custom-checkbox').addEventListener('click', () => {
        updateDemandStatus(demand.id, isCompleted ? 'todo' : 'completed');
      });

      row.querySelector('.btn-edit-list').addEventListener('click', () => {
        openModalForEdit(demand.id);
      });

      row.querySelector('.btn-delete-list').addEventListener('click', () => {
        if (confirm(`Deseja excluir "${demand.title}"?`)) {
          deleteDemand(demand.id);
        }
      });

      container.appendChild(row);
    });
  }

  // --- DASHBOARD VIEW RENDER ---
  function renderDashboardView() {
    const total = demands.length;
    const completed = demands.filter(d => d.status === 'completed').length;
    const inProgress = demands.filter(d => d.status === 'in-progress').length;
    const urgent = demands.filter(d => d.priority === 'urgente' && d.status !== 'completed').length;

    document.getElementById('dash-total').textContent = total;
    document.getElementById('dash-completed').textContent = completed;
    document.getElementById('dash-in-progress').textContent = inProgress;
    document.getElementById('dash-urgent').textContent = urgent;

    // Category Breakdown Bars
    const categoriesMap = {};
    demands.forEach(d => {
      const cat = d.category || 'Outros';
      categoriesMap[cat] = (categoriesMap[cat] || 0) + 1;
    });

    const categoryBarsContainer = document.getElementById('dash-category-bars');
    categoryBarsContainer.innerHTML = '';

    const colors = ['#6366f1', '#a855f7', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e'];
    let colorIdx = 0;

    Object.keys(categoriesMap).forEach(cat => {
      const count = categoriesMap[cat];
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      const barColor = colors[colorIdx % colors.length];
      colorIdx++;

      const barItem = document.createElement('div');
      barItem.className = 'cat-bar-item';
      barItem.innerHTML = `
        <div class="cat-bar-label">
          <span>${escapeHtml(cat)}</span>
          <span style="color: var(--text-muted);">${count} demandas (${pct}%)</span>
        </div>
        <div class="cat-bar-track">
          <div class="cat-bar-fill" style="width: ${pct}%; background: ${barColor};"></div>
        </div>
      `;
      categoryBarsContainer.appendChild(barItem);
    });

    // Urgent Alerts Widget
    const urgentListContainer = document.getElementById('dash-urgent-list');
    urgentListContainer.innerHTML = '';

    const urgentItems = demands.filter(d => d.priority === 'urgente' && d.status !== 'completed');
    if (urgentItems.length === 0) {
      urgentListContainer.innerHTML = `<div style="font-size: 0.85rem; color: var(--text-muted);">Nenhuma demanda urgente pendente! Excelente controle.</div>`;
    } else {
      urgentItems.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'urgent-item';
        itemEl.innerHTML = `
          <span class="urgent-item-title">${escapeHtml(item.title)}</span>
          <span class="urgent-item-date">${item.deadline ? 'Até ' + new Date(item.deadline + 'T00:00:00').toLocaleDateString('pt-BR') : 'Urgente'}</span>
        `;
        urgentListContainer.appendChild(itemEl);
      });
    }
  }

  function updateSidebarProgress() {
    const total = demands.length;
    const completed = demands.filter(d => d.status === 'completed').length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    document.getElementById('sidebar-progress-percent').textContent = `${pct}%`;
    document.getElementById('sidebar-progress-fill').style.width = `${pct}%`;
  }

  // --- MODAL HANDLERS ---
  const modalOverlay = document.getElementById('modal-demand');
  const demandForm = document.getElementById('demand-form');

  document.getElementById('btn-open-modal').addEventListener('click', () => {
    openModalForCreate();
  });

  document.getElementById('btn-close-modal').addEventListener('click', closeModal);
  document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);

  function openModalForCreate() {
    document.getElementById('modal-title').textContent = 'Nova Demanda';
    document.getElementById('demand-id').value = '';
    demandForm.reset();
    modalSubtasks = [];
    renderModalChecklist();
    modalOverlay.classList.add('active');
  }

  function openModalForEdit(id) {
    const target = demands.find(d => d.id === id);
    if (!target) return;

    document.getElementById('modal-title').textContent = 'Editar Demanda';
    document.getElementById('demand-id').value = target.id;
    document.getElementById('input-title').value = target.title;
    document.getElementById('input-description').value = target.description || '';
    document.getElementById('select-priority').value = target.priority;
    document.getElementById('input-category').value = target.category || '';
    document.getElementById('select-status').value = target.status;
    document.getElementById('input-deadline').value = target.deadline || '';

    modalSubtasks = target.subtasks ? JSON.parse(JSON.stringify(target.subtasks)) : [];
    renderModalChecklist();
    modalOverlay.classList.add('active');
  }

  function closeModal() {
    modalOverlay.classList.remove('active');
  }

  // Checklist Manager in Modal
  document.getElementById('btn-add-subtask').addEventListener('click', addSubtaskFromInput);
  document.getElementById('input-subtask').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSubtaskFromInput();
    }
  });

  function addSubtaskFromInput() {
    const input = document.getElementById('input-subtask');
    const text = input.value.trim();
    if (text) {
      modalSubtasks.push({ text: text, done: false });
      input.value = '';
      renderModalChecklist();
    }
  }

  function renderModalChecklist() {
    const container = document.getElementById('modal-checklist-items');
    container.innerHTML = '';

    modalSubtasks.forEach((st, idx) => {
      const row = document.createElement('div');
      row.className = 'checklist-item-row';
      row.innerHTML = `
        <input type="checkbox" ${st.done ? 'checked' : ''} data-idx="${idx}">
        <span style="${st.done ? 'text-decoration: line-through; color: var(--text-dim);' : ''}">${escapeHtml(st.text)}</span>
        <button type="button" class="checklist-remove-btn" data-idx="${idx}">&times;</button>
      `;

      row.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
        modalSubtasks[idx].done = e.target.checked;
        renderModalChecklist();
      });

      row.querySelector('.checklist-remove-btn').addEventListener('click', () => {
        modalSubtasks.splice(idx, 1);
        renderModalChecklist();
      });

      container.appendChild(row);
    });
  }

  // Form Submit
  demandForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('demand-id').value;
    const title = document.getElementById('input-title').value.trim();
    const description = document.getElementById('input-description').value.trim();
    const priority = document.getElementById('select-priority').value;
    const category = document.getElementById('input-category').value.trim() || 'Geral';
    const status = document.getElementById('select-status').value;
    const deadline = document.getElementById('input-deadline').value;

    if (id) {
      // Editar existente
      const target = demands.find(d => d.id === id);
      if (target) {
        target.title = title;
        target.description = description;
        target.priority = priority;
        target.category = category;
        target.status = status;
        target.deadline = deadline;
        target.subtasks = modalSubtasks;
      }
    } else {
      // Criar novo
      const newDemand = {
        id: 'dem-' + Date.now(),
        title,
        description,
        priority,
        category,
        status,
        deadline,
        subtasks: modalSubtasks,
        createdAt: new Date().toISOString()
      };
      demands.unshift(newDemand);
    }

    saveDemands();
    closeModal();
  });

  function deleteDemand(id) {
    demands = demands.filter(d => d.id !== id);
    saveDemands();
  }

  // --- NAVIGATION VIEW SWITCHER ---
  const navItems = document.querySelectorAll('.nav-item[data-view]');
  const viewSections = document.querySelectorAll('.view-section');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const viewName = item.dataset.view;
      if (!viewName) return;

      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      viewSections.forEach(sec => sec.classList.remove('active'));
      document.getElementById(`view-${viewName}`).classList.add('active');
      currentView = viewName;
    });
  });

  // --- FILTERS & SEARCH EVENT LISTENERS ---
  document.getElementById('search-input').addEventListener('input', (e) => {
    currentSearch = e.target.value;
    renderApp();
  });

  document.getElementById('filter-priority').addEventListener('change', (e) => {
    currentPriorityFilter = e.target.value;
    renderApp();
  });

  document.getElementById('filter-category').addEventListener('change', (e) => {
    currentCategoryFilter = e.target.value;
    renderApp();
  });

  // --- POMODORO TIMER LOGIC ---
  const pomoDisplay = document.getElementById('pomo-display');
  const pomoTaskName = document.getElementById('pomo-task-name');
  const pomoStartBtn = document.getElementById('pomo-start-btn');
  const pomoResetBtn = document.getElementById('pomo-reset-btn');

  function updatePomodoroDisplay() {
    const mins = Math.floor(pomodoroTimeLeft / 60);
    const secs = pomodoroTimeLeft % 60;
    pomoDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  pomoStartBtn.addEventListener('click', () => {
    if (pomodoroIsRunning) {
      pausePomodoro();
    } else {
      startPomodoro();
    }
  });

  pomoResetBtn.addEventListener('click', () => {
    pausePomodoro();
    pomodoroTimeLeft = 25 * 60;
    updatePomodoroDisplay();
  });

  function startPomodoro() {
    pomodoroIsRunning = true;
    pomoStartBtn.textContent = 'Pausar';
    pomoStartBtn.style.background = 'var(--priority-urgente)';

    pomodoroInterval = setInterval(() => {
      if (pomodoroTimeLeft > 0) {
        pomodoroTimeLeft--;
        updatePomodoroDisplay();
      } else {
        pausePomodoro();
        playBeepSound();
        alert('🎉 Sessão Pomodoro concluída! Hora de fazer uma pausa.');
      }
    }, 1000);
  }

  function pausePomodoro() {
    pomodoroIsRunning = false;
    clearInterval(pomodoroInterval);
    pomoStartBtn.textContent = 'Iniciar';
    pomoStartBtn.style.background = 'var(--accent-gradient)';
  }

  function attachToPomodoro(demand) {
    pomodoroActiveDemandId = demand.id;
    pomoTaskName.textContent = `Demanda: ${demand.title}`;
    pomodoroTimeLeft = 25 * 60;
    updatePomodoroDisplay();
    startPomodoro();
  }

  function playBeepSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch (e) {
      console.log('Audio not supported or blocked');
    }
  }

  function playCelebrationEffect() {
    // Efeito sonoro sutil de conquista
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.15); // E5
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch(e) {}
  }

  // --- BACKUP EXPORT / IMPORT MODAL ---
  const modalBackup = document.getElementById('modal-backup');
  document.getElementById('btn-open-export-modal').addEventListener('click', () => {
    modalBackup.classList.add('active');
  });

  document.getElementById('btn-close-backup-modal').addEventListener('click', () => modalBackup.classList.remove('active'));
  document.getElementById('btn-close-backup-footer').addEventListener('click', () => modalBackup.classList.remove('active'));

  // Download JSON
  document.getElementById('btn-download-json').addEventListener('click', () => {
    const jsonStr = JSON.stringify(demands, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `taskflow_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Import JSON
  document.getElementById('input-import-json').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (Array.isArray(imported)) {
          demands = imported;
          saveDemands();
          modalBackup.classList.remove('active');
          alert('✅ Dados importados com sucesso!');
        } else {
          alert('❌ Arquivo inválido: O conteúdo não é uma lista de demandas.');
        }
      } catch (err) {
        alert('❌ Erro ao ler arquivo JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  });

  // Reset Sample Data
  document.getElementById('btn-reset-data').addEventListener('click', () => {
    if (confirm('Deseja resetar as demandas para os dados de exemplo padrão?')) {
      demands = initialSampleDemands;
      saveDemands();
    }
  });

  // --- ESCAPE HTML UTILITY ---
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // --- INITIAL START ---
  loadDemands();
  renderApp();

});
