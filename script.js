'use strict';

const STORAGE_KEY = 'ippm-membership-form-draft-v1';
const MAX_PHOTO_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_CV_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

// DOM References
const form = document.getElementById('membershipForm');
const academicRows = document.getElementById('academicRows');
const professionalRows = document.getElementById('professionalRows');
const academicTemplate = document.getElementById('academicRowTemplate');
const professionalTemplate = document.getElementById('professionalRowTemplate');
const photoInput = document.getElementById('passportPhoto');
const photoPreview = document.getElementById('photoPreview');
const removePhotoButton = document.getElementById('removePhoto');
const formMessage = document.getElementById('formMessage');
const organisationLogo = document.getElementById('organisationLogo');
const logoFallback = document.querySelector('.logo-fallback');
const cvInput = document.getElementById('cvFile');
const certificateInput = document.getElementById('certificateFiles');

// ========== Message System ==========
function showMessage(message, type = 'success', duration = 5000) {
  formMessage.textContent = message;
  formMessage.className = `form-message visible ${type}`;
  formMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  
  // Auto-hide success messages after duration
  if (type === 'success' && duration > 0) {
    clearTimeout(formMessage._hideTimer);
    formMessage._hideTimer = setTimeout(() => {
      clearMessage();
    }, duration);
  }
}

function clearMessage() {
  formMessage.textContent = '';
  formMessage.className = 'form-message';
  clearTimeout(formMessage._hideTimer);
}

// ========== Row Management ==========
function addRow(container, template, values = {}) {
  const fragment = template.content.cloneNode(true);
  const row = fragment.querySelector('tr');
  const inputs = row.querySelectorAll('input');

  // Populate values
  if (inputs.length >= 3) {
    inputs[0].value = values.institute || '';
    inputs[1].value = values.qualification || '';
    inputs[2].value = values.year || '';
  }

  // Add remove handler
  const removeBtn = row.querySelector('.remove-row');
  removeBtn.addEventListener('click', () => {
    if (container.children.length === 1) {
      // Clear instead of remove if only one row
      inputs.forEach((input) => {
        input.value = '';
      });
      // Focus the first input
      inputs[0].focus();
      showMessage('Row cleared. At least one row is required.', 'info', 2000);
      return;
    }
    row.remove();
    showMessage('Row removed successfully.', 'info', 1500);
  });

  // Add input validation for year field
  const yearInput = inputs[2];
  if (yearInput) {
    yearInput.addEventListener('input', () => {
      const val = parseInt(yearInput.value);
      if (val && (val < 1900 || val > new Date().getFullYear())) {
        yearInput.setCustomValidity('Please enter a valid year (1900-current)');
      } else {
        yearInput.setCustomValidity('');
      }
    });
  }

  container.appendChild(fragment);
  
  // Focus first input for better UX
  const firstInput = row.querySelector('input');
  if (firstInput && !values.institute) {
    setTimeout(() => firstInput.focus(), 100);
  }
}

function ensureInitialRows() {
  if (!academicRows.children.length) {
    for (let index = 0; index < 4; index += 1) {
      addRow(academicRows, academicTemplate);
    }
  }

  if (!professionalRows.children.length) {
    for (let index = 0; index < 3; index += 1) {
      addRow(professionalRows, professionalTemplate);
    }
  }
}

function collectRows(container) {
  return Array.from(container.querySelectorAll('tr'))
    .map((row) => {
      const inputs = row.querySelectorAll('input');
      return {
        institute: inputs[0]?.value.trim() || '',
        qualification: inputs[1]?.value.trim() || '',
        year: inputs[2]?.value.trim() || ''
      };
    })
    .filter((row) => row.institute || row.qualification || row.year);
}

// ========== Data Collection ==========
function collectFormData() {
  const data = {};
  const elements = form.querySelectorAll('input:not([type="file"]):not([name$="[]"]), select, textarea');

  elements.forEach((element) => {
    if (!element.name) return;
    if (element.type === 'checkbox') {
      data[element.name] = element.checked;
    } else if (element.type === 'date') {
      data[element.name] = element.value || '';
    } else {
      data[element.name] = element.value.trim();
    }
  });

  // Collect qualification data
  data.academicQualifications = collectRows(academicRows);
  data.professionalQualifications = collectRows(professionalRows);
  
  // Collect file information
  data.attachments = {
    passportPhoto: photoInput.files[0] ? {
      name: photoInput.files[0].name,
      size: photoInput.files[0].size,
      type: photoInput.files[0].type
    } : null,
    curriculumVitae: cvInput.files[0] ? {
      name: cvInput.files[0].name,
      size: cvInput.files[0].size,
      type: cvInput.files[0].type
    } : null,
    certificates: Array.from(certificateInput.files).map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type
    }))
  };
  
  data.generatedAt = new Date().toISOString();
  data.formVersion = '1.0';

  return data;
}

// ========== Draft Management ==========
function saveDraft() {
  try {
    const data = collectFormData();
    // Remove file data from draft (too large for localStorage)
    delete data.attachments;
    
    // Add timestamp for draft
    data._draftSavedAt = new Date().toISOString();
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    showMessage('✅ Draft saved successfully!', 'success', 3000);
  } catch (error) {
    console.error('Draft save error:', error);
    if (error.name === 'QuotaExceededError') {
      showMessage('❌ Storage quota exceeded. Please clear some data or download your application.', 'error');
    } else {
      showMessage('❌ Failed to save draft. Please try again.', 'error');
    }
  }
}

function restoreDraft() {
  const rawDraft = localStorage.getItem(STORAGE_KEY);
  if (!rawDraft) return false;

  try {
    const data = JSON.parse(rawDraft);

    // Restore form fields
    Object.entries(data).forEach(([name, value]) => {
      if (['academicQualifications', 'professionalQualifications', 'generatedAt', 'formVersion', '_draftSavedAt'].includes(name)) {
        return;
      }
      const element = form.elements.namedItem(name);
      if (!element) return;
      
      if (element.type === 'checkbox') {
        element.checked = Boolean(value);
      } else {
        element.value = value ?? '';
      }
    });

    // Restore academic rows
    academicRows.innerHTML = '';
    const savedAcademic = data.academicQualifications || [];
    if (savedAcademic.length) {
      savedAcademic.forEach((row) => addRow(academicRows, academicTemplate, row));
    }

    // Restore professional rows
    professionalRows.innerHTML = '';
    const savedProfessional = data.professionalQualifications || [];
    if (savedProfessional.length) {
      savedProfessional.forEach((row) => addRow(professionalRows, professionalTemplate, row));
    }

    ensureInitialRows();
    
    const draftDate = data._draftSavedAt ? new Date(data._draftSavedAt).toLocaleString() : 'recently';
    showMessage(`📂 Draft restored from ${draftDate}`, 'success', 4000);
    return true;
  } catch (error) {
    console.error('Draft restore error:', error);
    localStorage.removeItem(STORAGE_KEY);
    return false;
  }
}

// ========== Photo Management ==========
function resetPhoto() {
  photoInput.value = '';
  photoPreview.innerHTML = '<span>📷 Electronic copy acceptable</span>';
  removePhotoButton.hidden = true;
  photoPreview.style.borderColor = '';
}

function handlePhotoSelection() {
  clearMessage();
  const file = photoInput.files[0];

  if (!file) {
    resetPhoto();
    return;
  }

  // Validate file type
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
    resetPhoto();
    showMessage('❌ Please select a JPEG, PNG, or WebP image for the passport photograph.', 'error');
    return;
  }

  // Validate file size
  if (file.size > MAX_PHOTO_SIZE) {
    resetPhoto();
    showMessage(`❌ Photo must be under 2MB. Current size: ${(file.size / 1024 / 1024).toFixed(2)}MB`, 'error');
    return;
  }

  // Preview image
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    const image = document.createElement('img');
    image.src = reader.result;
    image.alt = 'Applicant passport preview';
    image.style.maxWidth = '100%';
    image.style.maxHeight = '200px';
    image.style.objectFit = 'contain';
    photoPreview.replaceChildren(image);
    removePhotoButton.hidden = false;
    showMessage('✅ Photo uploaded successfully', 'success', 2000);
  });
  reader.addEventListener('error', () => {
    resetPhoto();
    showMessage('❌ Failed to read photo file. Please try again.', 'error');
  });
  reader.readAsDataURL(file);
}

// ========== File Validation ==========
function validateFile(input, allowedTypes, maxSize, typeName) {
  const file = input.files[0];
  if (!file) return true;

  if (!allowedTypes.includes(file.type)) {
    showMessage(`❌ ${typeName} must be ${allowedTypes.join(', ')}`, 'error');
    input.value = '';
    return false;
  }

  if (maxSize && file.size > maxSize) {
    showMessage(`❌ ${typeName} must be under ${(maxSize / 1024 / 1024).toFixed(1)}MB`, 'error');
    input.value = '';
    return false;
  }

  return true;
}

// ========== Export Functions ==========
function downloadApplication() {
  clearMessage();
  const data = collectFormData();
  const applicant = [data.surname, data.firstName].filter(Boolean).join('-').toLowerCase() || 'applicant';
  const safeName = applicant.replace(/[^a-z0-9-]+/g, '-');
  const timestamp = new Date().toISOString().slice(0, 10);
  
  // Create JSON file
  const jsonBlob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const jsonUrl = URL.createObjectURL(jsonBlob);
  
  // Create HTML summary
  const htmlContent = generateHTMLSummary(data);
  const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
  const htmlUrl = URL.createObjectURL(htmlBlob);

  // Show download options
  const choice = confirm(
    'Download as:\n• OK = JSON data file\n• Cancel = HTML summary (human-readable)'
  );

  const link = document.createElement('a');
  if (choice) {
    link.href = jsonUrl;
    link.download = `ippm-application-${safeName}-${timestamp}.json`;
    showMessage('📥 Application data downloaded as JSON.', 'success', 3000);
  } else {
    link.href = htmlUrl;
    link.download = `ippm-application-${safeName}-${timestamp}.html`;
    showMessage('📥 Application summary downloaded as HTML.', 'success', 3000);
  }
  
  document.body.appendChild(link);
  link.click();
  link.remove();
  
  // Clean up URLs
  setTimeout(() => {
    URL.revokeObjectURL(jsonUrl);
    URL.revokeObjectURL(htmlUrl);
  }, 10000);
}

function generateHTMLSummary(data) {
  const rows = (items) => items.map(item => 
    `<tr><td>${item.institute || '-'}</td><td>${item.qualification || '-'}</td><td>${item.year || '-'}</td></tr>`
  ).join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>IPPM Application Summary</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }
  h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
  h2 { color: #34495e; margin-top: 30px; }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  th { background: #3498db; color: white; padding: 10px; text-align: left; }
  td { padding: 8px 10px; border-bottom: 1px solid #ddd; }
  .field { margin: 10px 0; }
  .label { font-weight: bold; display: inline-block; width: 200px; }
  .footer { margin-top: 40px; border-top: 1px solid #ddd; padding-top: 20px; color: #7f8c8d; font-size: 0.9em; }
</style>
</head>
<body>
  <h1>🏛️ IPPM Membership Application</h1>
  <p><strong>Generated:</strong> ${new Date(data.generatedAt).toLocaleString()}</p>
  
  <h2>Section 1: General Information</h2>
  <div class="field"><span class="label">Title:</span> ${data.title || '-'}</div>
  <div class="field"><span class="label">Name:</span> ${data.surname || ''} ${data.firstName || ''} ${data.otherNames || ''}</div>
  <div class="field"><span class="label">Date of Birth:</span> ${data.dateOfBirth || '-'}</div>
  <div class="field"><span class="label">Nationality:</span> ${data.nationality || '-'}</div>
  <div class="field"><span class="label">Telephone:</span> ${data.telephone || '-'}</div>
  <div class="field"><span class="label">Email:</span> ${data.email || '-'}</div>
  <div class="field"><span class="label">Job Title:</span> ${data.jobTitle || '-'}</div>
  <div class="field"><span class="label">Company Address:</span> ${data.companyAddress || '-'}</div>
  <div class="field"><span class="label">Correspondence Address:</span> ${data.correspondenceAddress || '-'}</div>

  <h2>Section 2: Academic Qualifications</h2>
  ${data.academicQualifications?.length ? `<table><thead><tr><th>Institute</th><th>Qualification</th><th>Year</th></tr></thead><tbody>${rows(data.academicQualifications)}</tbody></table>` : '<p>None provided</p>'}

  <h2>Section 2: Professional Qualifications</h2>
  ${data.professionalQualifications?.length ? `<table><thead><tr><th>Institute</th><th>Qualification</th><th>Year</th></tr></thead><tbody>${rows(data.professionalQualifications)}</tbody></table>` : '<p>None provided</p>'}

  <h2>Section 3: Declaration</h2>
  <div class="field"><span class="label">Declaration Accepted:</span> ${data.declaration ? '✅ Yes' : '❌ No'}</div>
  <div class="field"><span class="label">Applicant Name:</span> ${data.applicantName || '-'}</div>
  <div class="field"><span class="label">Application Date:</span> ${data.applicationDate || '-'}</div>

  <div class="footer">
    <p>📄 This is a summary of the application data. Attachments are not included in this export.</p>
    <p>IPPM — Through Knowledge. Through Partnership. For Humanity!</p>
  </div>
</body>
</html>
  `;
}

// ========== Form Validation ==========
function validateAndPrepare(event) {
  event.preventDefault();
  clearMessage();

  // Check form validity
  if (!form.checkValidity()) {
    form.reportValidity();
    const invalidFields = form.querySelectorAll(':invalid');
    showMessage(`❌ Please complete ${invalidFields.length} required field(s) before validating.`, 'error');
    
    // Focus first invalid field
    const firstInvalid = form.querySelector(':invalid');
    if (firstInvalid) {
      setTimeout(() => firstInvalid.focus(), 300);
    }
    return;
  }

  // Validate declaration checkbox is checked
  const declaration = document.getElementById('declaration');
  if (!declaration.checked) {
    showMessage('❌ You must accept the declaration to validate the application.', 'error');
    declaration.focus();
    return;
  }

  // Save draft and show success
  saveDraft();
  showMessage(
    '✅ Application is complete and valid! Since this is a static demo, data is not sent to a server. Please download or print your application for records.',
    'success',
    6000
  );
}

// ========== Auto-save Functionality ==========
let autoSaveTimer = null;

function setupAutoSave() {
  const inputs = form.querySelectorAll('input:not([type="file"]), select, textarea');
  inputs.forEach((input) => {
    input.addEventListener('change', () => {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(saveDraft, 2000);
    });
    input.addEventListener('input', () => {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(saveDraft, 3000);
    });
  });
}

// ========== Export as PDF (using window.print) ==========
function printForm() {
  // Add print-specific styling
  const style = document.createElement('style');
  style.id = 'print-style';
  style.textContent = `
    @media print {
      .form-actions { display: none !important; }
      .photo-preview img { max-height: 150px !important; }
      .form-message { display: none !important; }
      .remove-row { display: none !important; }
      .action-column { display: none !important; }
      .section-subheading button { display: none !important; }
      .application-form { max-width: 100% !important; padding: 0 !important; }
    }
  `;
  document.head.appendChild(style);
  
  window.print();
  
  // Clean up print styles
  setTimeout(() => {
    const printStyle = document.getElementById('print-style');
    if (printStyle) printStyle.remove();
  }, 1000);
}

// ========== Event Listeners ==========
document.getElementById('addAcademicRow').addEventListener('click', () => {
  addRow(academicRows, academicTemplate);
  showMessage('➕ Academic qualification row added', 'info', 1500);
});

document.getElementById('addProfessionalRow').addEventListener('click', () => {
  addRow(professionalRows, professionalTemplate);
  showMessage('➕ Professional qualification row added', 'info', 1500);
});

document.getElementById('saveDraft').addEventListener('click', saveDraft);
document.getElementById('clearForm').addEventListener('click', clearForm);
document.getElementById('downloadApplication').addEventListener('click', downloadApplication);
document.getElementById('printForm').addEventListener('click', printForm);

removePhotoButton.addEventListener('click', resetPhoto);
photoInput.addEventListener('change', handlePhotoSelection);

// File validation for CV
cvInput.addEventListener('change', () => {
  validateFile(cvInput, ALLOWED_CV_TYPES, 5 * 1024 * 1024, 'CV');
});

// File validation for certificates
certificateInput.addEventListener('change', () => {
  const files = certificateInput.files;
  if (files.length > 10) {
    showMessage('⚠️ Maximum 10 certificates allowed. Please select fewer files.', 'error');
    certificateInput.value = '';
    return;
  }
  
  let valid = true;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
      showMessage(`❌ Certificate "${file.name}" is not a valid format (JPEG, PNG, WebP, or PDF).`, 'error');
      certificateInput.value = '';
      valid = false;
      break;
    }
    if (file.size > 5 * 1024 * 1024) {
      showMessage(`❌ Certificate "${file.name}" exceeds 5MB limit.`, 'error');
      certificateInput.value = '';
      valid = false;
      break;
    }
  }
  if (valid && files.length > 0) {
    showMessage(`✅ ${files.length} certificate(s) selected`, 'success', 2000);
  }
});

form.addEventListener('submit', validateAndPrepare);

// Logo fallback
organisationLogo.addEventListener('error', () => {
  organisationLogo.style.display = 'none';
  logoFallback.style.display = 'grid';
});

// ========== Keyboard Shortcuts ==========
document.addEventListener('keydown', (e) => {
  // Ctrl+S to save draft
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveDraft();
  }
  // Ctrl+P to print
  if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
    e.preventDefault();
    printForm();
  }
});

// ========== Initialization ==========
ensureInitialRows();
const draftRestored = restoreDraft();

if (!draftRestored) {
  // Set default application date
  const dateInput = document.getElementById('applicationDate');
  if (!dateInput.value) {
    dateInput.valueAsDate = new Date();
  }
  showMessage('💡 Fill in the form and click "Save draft" to store your progress.', 'info', 5000);
}

// Setup auto-save
setupAutoSave();

// Expose functions globally for debugging
window.debug = {
  collectFormData,
  saveDraft,
  restoreDraft,
  clearForm,
  downloadApplication,
  addRow,
  showMessage
};

console.log('✅ IPPM Application Form loaded successfully!');
console.log('💡 Tip: Use Ctrl+S to save draft, Ctrl+P to print');
