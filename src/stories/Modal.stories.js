/**
 * DYDTT Phase 1 — Modal Storybook Stories
 */

export default {
  title: 'Components/Modal',
  tags:  ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Three-tab modal: Edit / Display / Account. ' +
                   'Focus-trapped. Closes on Escape. Driven by store UI state.',
      },
    },
    layout: 'fullscreen',
  },
};

function buildOverlay(activeTab = 'edit') {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'modal-heading-story');

  const panel = document.createElement('div');
  panel.className = 'modal-panel';

  const h = document.createElement('h2');
  h.id = 'modal-heading-story';
  h.className = 'sr-only';
  h.textContent = 'Menu';
  panel.appendChild(h);

  const tabList = document.createElement('div');
  tabList.className = 'modal-tabs';
  tabList.setAttribute('role', 'tablist');

  ['edit', 'settings', 'account'].forEach(id => {
    const btn = document.createElement('button');
    btn.className = `modal-tab${id === activeTab ? ' active' : ''}`;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(id === activeTab));
    btn.setAttribute('aria-controls', `tab-panel-${id}-s`);
    btn.id = `tab-btn-${id}-s`;
    btn.textContent = { edit: 'Edit', settings: 'Display', account: 'Account' }[id];
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.modal-tab').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      overlay.querySelectorAll('.modal-tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      overlay.querySelector(`#tab-panel-${id}-s`)?.classList.add('active');
    });
    tabList.appendChild(btn);
  });

  panel.appendChild(tabList);

  // Edit panel
  const edit = document.createElement('div');
  edit.className = `modal-tab-panel${activeTab === 'edit' ? ' active' : ''}`;
  edit.id = 'tab-panel-edit-s';
  edit.innerHTML = `
    <div class="form-group">
      <label class="form-label" for="s-task-title">Task title</label>
      <input class="form-input" id="s-task-title" type="text" placeholder="What needs doing?" />
    </div>
    <div class="form-group">
      <label class="form-label" for="s-task-date">Date</label>
      <input class="form-input" id="s-task-date" type="date" />
    </div>
    <div class="modal-footer">
      <button class="btn btn--secondary">Cancel</button>
      <button class="btn btn--primary">Save</button>
    </div>`;
  panel.appendChild(edit);

  // Settings panel
  const settings = document.createElement('div');
  settings.className = `modal-tab-panel${activeTab === 'settings' ? ' active' : ''}`;
  settings.id = 'tab-panel-settings-s';
  settings.innerHTML = `
    <div class="toggle-row">
      <label class="toggle-label" for="s-reduced-motion">Reduced motion</label>
      <label class="toggle-switch">
        <input type="checkbox" id="s-reduced-motion" />
        <span class="toggle-track"></span>
      </label>
    </div>
    <div class="toggle-row">
      <label class="toggle-label" for="s-push">Reminder notifications</label>
      <label class="toggle-switch">
        <input type="checkbox" id="s-push" />
        <span class="toggle-track"></span>
      </label>
    </div>`;
  panel.appendChild(settings);

  // Account panel (signed in)
  const logout = document.createElement('div');
  logout.className = `modal-tab-panel${activeTab === 'account' ? ' active' : ''}`;
  logout.id = 'tab-panel-account-s';
  logout.innerHTML = `
    <p style="color:var(--color-text-secondary);margin-bottom:var(--space-6);line-height:1.6">
      Your tasks sync to this account. Signing out removes them from this device; they stay in your account.
    </p>
    <button class="btn btn--danger" style="width:100%">Sign out</button>`;
  panel.appendChild(logout);

  overlay.appendChild(panel);
  return overlay;
}

export const EditTab = {
  name: 'Edit tab (default)',
  render: () => buildOverlay('edit'),
};

export const SettingsTab = {
  name: 'Display tab',
  render: () => buildOverlay('settings'),
};

export const AccountTab = {
  name: 'Account tab',
  render: () => buildOverlay('account'),
};
