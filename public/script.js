'use strict';

const dom = {
  sidebar: document.getElementById('sidebar'),
  sidebarScrim: document.getElementById('sidebarScrim'),
  sidebarClose: document.getElementById('sidebarClose'),
  mobileMenu: document.getElementById('mobileMenu'),
  sidebarTags: document.getElementById('sidebarTags'),
  sidebarTagTotal: document.getElementById('sidebarTagTotal'),
  navContactCount: document.getElementById('navContactCount'),
  addContactBtn: document.getElementById('addContactBtn'),
  searchInput: document.getElementById('searchInput'),
  sortSelect: document.getElementById('sortSelect'),
  filterChips: document.getElementById('filterChips'),
  contactsBody: document.getElementById('contactsBody'),
  tableShell: document.querySelector('.table-shell'),
  tableLoading: document.getElementById('tableLoading'),
  emptyState: document.getElementById('emptyState'),
  emptyTitle: document.getElementById('emptyTitle'),
  emptyText: document.getElementById('emptyText'),
  emptyActionBtn: document.getElementById('emptyActionBtn'),
  resultCount: document.getElementById('resultCount'),
  resultSummary: document.getElementById('resultSummary'),
  statTotal: document.getElementById('statTotal'),
  statClients: document.getElementById('statClients'),
  statLeads: document.getElementById('statLeads'),
  statRecent: document.getElementById('statRecent'),
  statCompanies: document.getElementById('statCompanies'),
  contactDialog: document.getElementById('contactDialog'),
  dialogTitle: document.getElementById('dialogTitle'),
  dialogSubtitle: document.getElementById('dialogSubtitle'),
  closeContactDialog: document.getElementById('closeContactDialog'),
  contactForm: document.getElementById('contactForm'),
  contactId: document.getElementById('contactId'),
  fullName: document.getElementById('fullName'),
  email: document.getElementById('email'),
  phone: document.getElementById('phone'),
  company: document.getElementById('company'),
  jobTitle: document.getElementById('jobTitle'),
  lastInteractionDate: document.getElementById('lastInteractionDate'),
  notes: document.getElementById('notes'),
  tagOptions: document.getElementById('tagOptions'),
  cancelContactBtn: document.getElementById('cancelContactBtn'),
  saveContactBtn: document.getElementById('saveContactBtn'),
  deleteDialog: document.getElementById('deleteDialog'),
  deleteContactName: document.getElementById('deleteContactName'),
  cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
  confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
  toastRegion: document.getElementById('toastRegion')
};

const state = {
  contacts: [],
  tags: [],
  stats: {
    totalContacts: 0,
    totalCompanies: 0,
    recentInteractions: 0
  },
  filters: {
    search: '',
    tag: '',
    sort: 'recent'
  },
  editingId: null,
  deletingId: null,
  loading: false,
  requestController: null
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^[0-9+().\-\s]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const numberFormatter = new Intl.NumberFormat();
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
});

let searchTimer = null;

class ApiError extends Error {
  constructor(message, status, fields) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields || {};
  }
}

async function api(path, options = {}) {
  const requestOptions = {
    method: options.method || 'GET',
    headers: {},
    signal: options.signal
  };

  if (options.body !== undefined) {
    requestOptions.headers['Content-Type'] = 'application/json';
    requestOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(path, requestOptions);

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      data.error || `Request failed with status ${response.status}.`,
      response.status,
      data.fields
    );
  }

  return data;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return entities[character];
  });
}

function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#64748b';
}

function todayLocalIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatNumber(value) {
  return numberFormatter.format(Number(value) || 0);
}

function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function initialsFor(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase() || '?';
}

function companyInitials(value) {
  const words = String(value || '')
    .trim()
    .split(/\s+/)
    .filter((word) => /[a-z0-9]/i.test(word));

  return words
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase() || 'C';
}

function avatarClass(contact) {
  const source = `${contact.name}${contact.id}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) | 0;
  }
  return `avatar-${Math.abs(hash) % 6}`;
}

function describeInteraction(dateValue) {
  if (!dateValue || !DATE_PATTERN.test(dateValue)) {
    return {
      label: 'No interactions yet',
      relative: '',
      tone: ''
    };
  }

  const parts = dateValue.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  if (Number.isNaN(date.getTime())) {
    return { label: 'No interactions yet', relative: '', tone: '' };
  }

  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const dateUtc = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  const days = Math.floor((todayUtc - dateUtc) / 86400000);

  let relative;
  if (days <= 0) {
    relative = 'Today';
  } else if (days === 1) {
    relative = 'Yesterday';
  } else if (days < 7) {
    relative = `${days} days ago`;
  } else if (days < 14) {
    relative = '1 week ago';
  } else if (days < 30) {
    relative = `${Math.floor(days / 7)} weeks ago`;
  } else if (days < 60) {
    relative = '1 month ago';
  } else if (days < 365) {
    relative = `${Math.floor(days / 30)} months ago`;
  } else {
    const years = Math.floor(days / 365);
    relative = `${years} ${pluralize(years, 'year')} ago`;
  }

  let tone = 'stale';
  if (days <= 14) {
    tone = 'fresh';
  } else if (days <= 60) {
    tone = 'warm';
  }

  return {
    label: dateFormatter.format(date),
    relative,
    tone
  };
}

function renderTagFilters() {
  const allActive = state.filters.tag === '';
  const allCount = formatNumber(state.stats.totalContacts);
  const buttons = [
    `<button class="filter-chip${allActive ? ' active' : ''}" type="button" data-tag="" aria-pressed="${allActive}">All <span class="filter-count">${allCount}</span></button>`
  ];

  for (const tag of state.tags) {
    const active = state.filters.tag.toLowerCase() === tag.name.toLowerCase();
    buttons.push(
      `<button class="filter-chip${active ? ' active' : ''}" type="button" data-tag="${escapeHtml(tag.name)}" style="--tag-color:${safeColor(tag.color)}" aria-pressed="${active}">
        <span class="tag-dot"></span>
        ${escapeHtml(tag.name)}
        <span class="filter-count">${formatNumber(tag.contactCount)}</span>
      </button>`
    );
  }

  dom.filterChips.innerHTML = buttons.join('');
}

function renderSidebarTags() {
  dom.sidebarTagTotal.textContent = `${state.tags.length} ${pluralize(state.tags.length, 'group')}`;

  if (state.tags.length === 0) {
    dom.sidebarTags.innerHTML = '<p class="sidebar-empty">No relationship groups yet.</p>';
    return;
  }

  dom.sidebarTags.innerHTML = state.tags
    .map((tag) => {
      const active = state.filters.tag.toLowerCase() === tag.name.toLowerCase();
      return `<button class="sidebar-tag${active ? ' active' : ''}" type="button" data-tag="${escapeHtml(tag.name)}" style="--tag-color:${safeColor(tag.color)}" aria-pressed="${active}">
        <span class="tag-dot"></span>
        <span class="tag-name">${escapeHtml(tag.name)}</span>
        <span class="tag-count">${formatNumber(tag.contactCount)}</span>
      </button>`;
    })
    .join('');
}

function updateStats() {
  const stats = state.stats;
  const clients = state.tags.find((tag) => tag.name.toLowerCase() === 'client');
  const leads = state.tags.find((tag) => tag.name.toLowerCase() === 'lead');

  dom.statTotal.textContent = formatNumber(stats.totalContacts);
  dom.statClients.textContent = formatNumber(clients ? clients.contactCount : 0);
  dom.statLeads.textContent = formatNumber(leads ? leads.contactCount : 0);
  dom.statRecent.textContent = formatNumber(stats.recentInteractions);
  dom.statCompanies.textContent = `${formatNumber(stats.totalCompanies)} ${pluralize(stats.totalCompanies, 'company', 'companies')}`;
  dom.navContactCount.textContent = formatNumber(stats.totalContacts);

  if (state.tags.length > 0) {
    renderTagFilters();
  }
}

function updateResultSummary() {
  const count = state.contacts.length;
  const search = state.filters.search.trim();
  const tag = state.filters.tag;

  dom.resultCount.textContent = formatNumber(count);

  if (search && tag) {
    dom.resultSummary.textContent = `${formatNumber(count)} ${pluralize(count, 'result')} for "${search}" in ${tag}`;
  } else if (search) {
    dom.resultSummary.textContent = `${formatNumber(count)} ${pluralize(count, 'result')} for "${search}"`;
  } else if (tag) {
    dom.resultSummary.textContent = `${formatNumber(count)} ${pluralize(count, 'contact')} tagged ${tag}`;
  } else {
    dom.resultSummary.textContent = `${formatNumber(count)} ${pluralize(count, 'contact')} in your network`;
  }
}

function updateEmptyState() {
  const hasContacts = state.contacts.length > 0;
  const hasFilters = Boolean(state.filters.search.trim() || state.filters.tag);

  dom.tableShell.hidden = !hasContacts;
  dom.emptyState.hidden = hasContacts || state.loading;

  if (hasContacts || state.loading) {
    return;
  }

  if (hasFilters) {
    dom.emptyTitle.textContent = 'No matches found';
    dom.emptyText.textContent = 'Try a different search term or clear your relationship filter.';
    dom.emptyActionBtn.textContent = 'Clear filters';
  } else {
    dom.emptyTitle.textContent = 'No contacts yet';
    dom.emptyText.textContent = 'Add your first contact to start building your network.';
    dom.emptyActionBtn.textContent = 'Add contact';
  }
}

function renderContacts() {
  dom.contactsBody.innerHTML = state.contacts
    .map((contact) => {
      const interaction = describeInteraction(contact.lastInteractionDate);
      const phoneHref = contact.phone.replace(/[^\d+]/g, '');
      const tags = contact.tags.length > 0
        ? contact.tags
            .map(
              (tag) =>
                `<span class="tag-chip" style="--tag-color:${safeColor(tag.color)}">${escapeHtml(tag.name)}</span>`
            )
            .join('')
        : '<span class="muted-value">No tags</span>';

      return `<tr>
        <td class="cell-contact" data-label="Contact">
          <div class="contact-cell">
            <span class="avatar ${avatarClass(contact)}" aria-hidden="true">${escapeHtml(initialsFor(contact.name))}</span>
            <div class="contact-details">
              <span class="contact-name">${escapeHtml(contact.name)}</span>
              <a class="contact-email" href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a>
            </div>
          </div>
        </td>
        <td class="cell-phone" data-label="Phone">
          <a class="phone-link" href="tel:${escapeHtml(phoneHref)}">${escapeHtml(contact.phone)}</a>
        </td>
        <td class="cell-company" data-label="Company">
          ${
            contact.company
              ? `<div class="company-value"><span class="company-mark" aria-hidden="true">${escapeHtml(companyInitials(contact.company))}</span><span title="${escapeHtml(contact.company)}">${escapeHtml(contact.company)}</span></div>`
              : '<span class="muted-value">No company</span>'
          }
        </td>
        <td class="cell-tags" data-label="Relationship">
          <div class="tag-list">${tags}</div>
        </td>
        <td class="cell-interaction" data-label="Last interaction">
          <div class="interaction">
            <div class="interaction-main">
              <span class="interaction-dot ${interaction.tone}"></span>
              <span class="interaction-date">${escapeHtml(interaction.label)}</span>
            </div>
            ${interaction.relative ? `<span class="interaction-relative">${escapeHtml(interaction.relative)}</span>` : ''}
          </div>
        </td>
        <td class="cell-actions">
          <div class="row-actions">
            <button class="row-action" type="button" data-action="edit" data-id="${contact.id}" title="Edit contact" aria-label="Edit ${escapeHtml(contact.name)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
              </svg>
            </button>
            <button class="row-action danger" type="button" data-action="delete" data-id="${contact.id}" title="Delete contact" aria-label="Delete ${escapeHtml(contact.name)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5"></path>
              </svg>
            </button>
          </div>
        </td>
      </tr>`;
    })
    .join('');

  updateResultSummary();
  updateEmptyState();
}

function setLoading(loading) {
  state.loading = loading;
  dom.tableLoading.hidden = !loading;
  dom.tableShell.classList.toggle('is-loading', loading && state.contacts.length > 0);
  dom.tableShell.setAttribute('aria-busy', String(loading));

  if (loading) {
    dom.emptyState.hidden = true;
  } else {
    updateEmptyState();
  }
}

async function loadContacts() {
  if (state.requestController) {
    state.requestController.abort();
  }

  const controller = new AbortController();
  state.requestController = controller;
  setLoading(true);

  const params = new URLSearchParams();
  if (state.filters.search.trim()) {
    params.set('search', state.filters.search.trim());
  }
  if (state.filters.tag) {
    params.set('tag', state.filters.tag);
  }
  if (state.filters.sort) {
    params.set('sort', state.filters.sort);
  }

  try {
    const query = params.toString();
    const data = await api(`/api/contacts${query ? `?${query}` : ''}`, {
      signal: controller.signal
    });

    if (controller !== state.requestController) {
      return;
    }

    state.contacts = Array.isArray(data.contacts) ? data.contacts : [];
    renderContacts();
  } catch (error) {
    if (error.name === 'AbortError') {
      return;
    }
    showToast(error.message || 'Unable to load contacts.', 'error');
  } finally {
    if (controller === state.requestController) {
      state.requestController = null;
      setLoading(false);
    }
  }
}

async function loadTags() {
  try {
    const data = await api('/api/tags');
    state.tags = Array.isArray(data.tags) ? data.tags : [];
    renderTagFilters();
    renderSidebarTags();
  } catch (error) {
    showToast(error.message || 'Unable to load relationship tags.', 'error');
  }
}

async function loadStats() {
  try {
    const data = await api('/api/stats');
    state.stats = data.stats || state.stats;
    updateStats();
  } catch (error) {
    showToast(error.message || 'Unable to load contact statistics.', 'error');
  }
}

async function reloadData() {
  await Promise.all([loadTags(), loadStats(), loadContacts()]);
  updateStats();
}

function renderTagOptions(selectedNames = []) {
  if (state.tags.length === 0) {
    dom.tagOptions.innerHTML = '<p class="tag-options-empty">Relationship tags are unavailable right now.</p>';
    return;
  }

  const selected = new Set(selectedNames.map((name) => name.toLowerCase()));
  dom.tagOptions.innerHTML = state.tags
    .map(
      (tag) =>
        `<label class="tag-option" style="--tag-color:${safeColor(tag.color)}">
          <input type="checkbox" name="tags" value="${escapeHtml(tag.name)}" ${selected.has(tag.name.toLowerCase()) ? 'checked' : ''}>
          <span>${escapeHtml(tag.name)}</span>
        </label>`
    )
    .join('');
}

function clearFormErrors() {
  dom.contactForm.querySelectorAll('.field.invalid').forEach((field) => {
    field.classList.remove('invalid');
  });

  dom.contactForm.querySelectorAll('.field-error').forEach((error) => {
    error.textContent = '';
  });

  dom.contactForm.querySelectorAll('[aria-invalid="true"]').forEach((control) => {
    control.removeAttribute('aria-invalid');
  });
}

function showFormErrors(errors) {
  clearFormErrors();
  let firstControl = null;
  const unmatched = [];

  for (const [fieldName, message] of Object.entries(errors)) {
    const field = dom.contactForm.querySelector(`[data-field="${fieldName}"]`);

    if (!field) {
      unmatched.push(message);
      continue;
    }

    field.classList.add('invalid');
    const errorElement = field.querySelector('.field-error');
    if (errorElement) {
      errorElement.textContent = message;
    }

    const control = field.querySelector('input, textarea');
    if (control) {
      control.setAttribute('aria-invalid', 'true');
      if (!firstControl) {
        firstControl = control;
      }
    }
  }

  if (unmatched.length > 0) {
    showToast(unmatched[0], 'error');
  }

  if (firstControl) {
    firstControl.focus();
  }
}

function emptyFormValues() {
  dom.contactForm.reset();
  dom.contactId.value = '';
  clearFormErrors();
}

function openAddDialog() {
  state.editingId = null;
  emptyFormValues();
  renderTagOptions();
  dom.dialogTitle.textContent = 'Add contact';
  dom.dialogSubtitle.textContent = 'Create a new relationship in your network.';
  dom.saveContactBtn.querySelector('.button-label').textContent = 'Save contact';
  dom.lastInteractionDate.max = todayLocalIso();
  dom.lastInteractionDate.value = '';

  if (!dom.contactDialog.open) {
    dom.contactDialog.showModal();
  }

  document.body.classList.add('modal-open');
  window.setTimeout(() => dom.fullName.focus(), 40);
}

function openEditDialog(contact) {
  state.editingId = contact.id;
  emptyFormValues();
  dom.contactId.value = String(contact.id);
  dom.fullName.value = contact.name;
  dom.email.value = contact.email;
  dom.phone.value = contact.phone;
  dom.company.value = contact.company;
  dom.jobTitle.value = contact.jobTitle;
  dom.notes.value = contact.notes;
  dom.lastInteractionDate.max = todayLocalIso();
  dom.lastInteractionDate.value = contact.lastInteractionDate || '';
  renderTagOptions(contact.tags.map((tag) => tag.name));
  dom.dialogTitle.textContent = 'Edit contact';
  dom.dialogSubtitle.textContent = `Update ${contact.name}'s details and relationship context.`;
  dom.saveContactBtn.querySelector('.button-label').textContent = 'Save changes';

  if (!dom.contactDialog.open) {
    dom.contactDialog.showModal();
  }

  document.body.classList.add('modal-open');
  window.setTimeout(() => dom.fullName.focus(), 40);
}

function closeContactDialog() {
  if (dom.contactDialog.open) {
    dom.contactDialog.close();
  }
}

function readFormPayload() {
  const checkedTags = Array.from(
    dom.tagOptions.querySelectorAll('input[type="checkbox"]:checked')
  ).map((input) => input.value);

  return {
    name: dom.fullName.value.trim(),
    email: dom.email.value.trim(),
    phone: dom.phone.value.trim(),
    company: dom.company.value.trim(),
    jobTitle: dom.jobTitle.value.trim(),
    notes: dom.notes.value.trim(),
    lastInteractionDate: dom.lastInteractionDate.value,
    tags: checkedTags
  };
}

function validatePayload(payload) {
  const errors = {};

  if (!payload.name) {
    errors.name = 'Full name is required.';
  } else if (payload.name.length > 120) {
    errors.name = 'Full name must be 120 characters or fewer.';
  }

  if (!payload.email) {
    errors.email = 'Email address is required.';
  } else if (payload.email.length > 254 || !EMAIL_PATTERN.test(payload.email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (!payload.phone) {
    errors.phone = 'Phone number is required.';
  } else {
    const digits = (payload.phone.match(/\d/g) || []).length;
    if (
      payload.phone.length > 30 ||
      digits < 7 ||
      digits > 15 ||
      !PHONE_PATTERN.test(payload.phone)
    ) {
      errors.phone = 'Enter a valid phone number with 7 to 15 digits.';
    }
  }

  if (payload.company.length > 120) {
    errors.company = 'Company must be 120 characters or fewer.';
  }

  if (payload.jobTitle.length > 120) {
    errors.jobTitle = 'Job title must be 120 characters or fewer.';
  }

  if (payload.notes.length > 2000) {
    errors.notes = 'Notes must be 2,000 characters or fewer.';
  }

  if (payload.lastInteractionDate) {
    const parsed = new Date(`${payload.lastInteractionDate}T00:00:00Z`);
    const validDate =
      DATE_PATTERN.test(payload.lastInteractionDate) &&
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === payload.lastInteractionDate;

    if (!validDate) {
      errors.lastInteractionDate = 'Enter a valid date.';
    } else if (payload.lastInteractionDate > todayLocalIso()) {
      errors.lastInteractionDate = 'Last interaction date cannot be in the future.';
    }
  }

  if (payload.tags.length > 8) {
    errors.tags = 'Choose no more than 8 tags.';
  }

  return errors;
}

function setButtonLoading(button, loading) {
  button.disabled = loading;
  button.classList.toggle('loading', loading);
  button.setAttribute('aria-busy', String(loading));
}

async function handleContactSubmit(event) {
  event.preventDefault();
  const payload = readFormPayload();
  const errors = validatePayload(payload);

  if (Object.keys(errors).length > 0) {
    showFormErrors(errors);
    return;
  }

  const editingId = state.editingId;
  const isEditing = Boolean(editingId);
  setButtonLoading(dom.saveContactBtn, true);

  try {
    await api(isEditing ? `/api/contacts/${editingId}` : '/api/contacts', {
      method: isEditing ? 'PUT' : 'POST',
      body: payload
    });

    closeContactDialog();
    state.editingId = null;
    showToast(
      isEditing ? `${payload.name} was updated successfully.` : `${payload.name} was added to your contacts.`,
      'success'
    );
    await reloadData();
  } catch (error) {
    if (error.fields && Object.keys(error.fields).length > 0) {
      showFormErrors(error.fields);
    }
    showToast(error.message || 'Unable to save the contact.', 'error');
  } finally {
    setButtonLoading(dom.saveContactBtn, false);
  }
}

function openDeleteDialog(contact) {
  state.deletingId = contact.id;
  dom.deleteContactName.textContent = contact.name;

  if (!dom.deleteDialog.open) {
    dom.deleteDialog.showModal();
  }

  document.body.classList.add('modal-open');
}

function closeDeleteDialog() {
  if (dom.deleteDialog.open) {
    dom.deleteDialog.close();
  }
}

async function handleDeleteConfirm() {
  if (!state.deletingId) {
    return;
  }

  const contact = state.contacts.find((item) => item.id === state.deletingId);
  const contactName = contact ? contact.name : 'Contact';
  const deletingId = state.deletingId;
  setButtonLoading(dom.confirmDeleteBtn, true);

  try {
    await api(`/api/contacts/${deletingId}`, { method: 'DELETE' });
    closeDeleteDialog();
    state.deletingId = null;
    showToast(`${contactName} was removed from your contacts.`, 'success');
    await reloadData();
  } catch (error) {
    showToast(error.message || 'Unable to delete the contact.', 'error');

    if (error.status === 404) {
      closeDeleteDialog();
      state.deletingId = null;
      await reloadData();
    }
  } finally {
    setButtonLoading(dom.confirmDeleteBtn, false);
  }
}

function setActiveTag(tag) {
  state.filters.tag = tag;
  renderTagFilters();
  renderSidebarTags();
  closeSidebar();
  loadContacts();
}

function clearFilters() {
  state.filters.search = '';
  state.filters.tag = '';
  state.filters.sort = 'recent';
  dom.searchInput.value = '';
  dom.sortSelect.value = 'recent';
  renderTagFilters();
  renderSidebarTags();
  loadContacts();
}

function openSidebar() {
  dom.sidebar.classList.add('open');
  dom.sidebarScrim.classList.add('visible');
  document.body.classList.add('nav-open');
  dom.mobileMenu.setAttribute('aria-expanded', 'true');
}

function closeSidebar() {
  dom.sidebar.classList.remove('open');
  dom.sidebarScrim.classList.remove('visible');
  document.body.classList.remove('nav-open');
  dom.mobileMenu.setAttribute('aria-expanded', 'false');
}

function showToast(message, type = 'success') {
  const icons = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"></path></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"></path></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 8h.01M11 12h1v5h1"></path></svg>'
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon" aria-hidden="true">${icons[type] || icons.info}</span>`;
  const text = document.createElement('span');
  text.textContent = message;
  toast.appendChild(text);
  dom.toastRegion.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add('leaving');
    window.setTimeout(() => toast.remove(), 220);
  }, 3800);
}

function bindEvents() {
  dom.addContactBtn.addEventListener('click', openAddDialog);

  dom.emptyActionBtn.addEventListener('click', () => {
    const hasFilters = Boolean(state.filters.search.trim() || state.filters.tag);
    if (hasFilters) {
      clearFilters();
    } else {
      openAddDialog();
    }
  });

  dom.searchInput.addEventListener('input', () => {
    state.filters.search = dom.searchInput.value;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(loadContacts, 220);
  });

  dom.sortSelect.addEventListener('change', () => {
    state.filters.sort = dom.sortSelect.value;
    loadContacts();
  });

  dom.filterChips.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-tag]');
    if (!button) {
      return;
    }
    setActiveTag(button.dataset.tag);
  });

  dom.sidebarTags.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-tag]');
    if (!button) {
      return;
    }
    setActiveTag(button.dataset.tag);
  });

  dom.contactsBody.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) {
      return;
    }

    const contact = state.contacts.find((item) => item.id === Number(button.dataset.id));
    if (!contact) {
      return;
    }

    if (button.dataset.action === 'edit') {
      openEditDialog(contact);
    } else if (button.dataset.action === 'delete') {
      openDeleteDialog(contact);
    }
  });

  dom.contactForm.addEventListener('submit', handleContactSubmit);

  dom.contactForm.addEventListener('input', (event) => {
    const field = event.target.closest('.field');
    if (!field) {
      return;
    }
    field.classList.remove('invalid');
    const errorElement = field.querySelector('.field-error');
    if (errorElement) {
      errorElement.textContent = '';
    }
    event.target.removeAttribute('aria-invalid');
  });

  dom.cancelContactBtn.addEventListener('click', closeContactDialog);
  dom.closeContactDialog.addEventListener('click', closeContactDialog);
  dom.cancelDeleteBtn.addEventListener('click', closeDeleteDialog);
  dom.confirmDeleteBtn.addEventListener('click', handleDeleteConfirm);

  dom.contactDialog.addEventListener('click', (event) => {
    if (event.target === dom.contactDialog) {
      closeContactDialog();
    }
  });

  dom.deleteDialog.addEventListener('click', (event) => {
    if (event.target === dom.deleteDialog) {
      closeDeleteDialog();
    }
  });

  dom.contactDialog.addEventListener('close', () => {
    if (!document.querySelector('dialog[open]')) {
      document.body.classList.remove('modal-open');
    }
  });

  dom.deleteDialog.addEventListener('close', () => {
    if (!document.querySelector('dialog[open]')) {
      document.body.classList.remove('modal-open');
    }
  });

  dom.mobileMenu.addEventListener('click', openSidebar);
  dom.sidebarClose.addEventListener('click', closeSidebar);
  dom.sidebarScrim.addEventListener('click', closeSidebar);

  document.querySelector('.nav-item').addEventListener('click', (event) => {
    event.preventDefault();
    clearFilters();
    closeSidebar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const isTyping = target instanceof HTMLElement &&
      (target.matches('input, textarea, select') || target.isContentEditable);

    if (event.key === '/' && !isTyping && !document.querySelector('dialog[open]')) {
      event.preventDefault();
      dom.searchInput.focus();
    }

    if (event.key === 'Escape') {
      closeSidebar();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 1020 && dom.sidebar.classList.contains('open')) {
      closeSidebar();
    }
  });
}

async function init() {
  dom.mobileMenu.setAttribute('aria-expanded', 'false');
  bindEvents();
  await loadTags();
  await Promise.all([loadStats(), loadContacts()]);
}

init();
