// URL de tu Google Apps Script
const API_URL = 'https://script.google.com/macros/s/AKfycbzMCUCT4ceHfXH_Ia1-j-A3rkKNvqFbvNLIxWnhwpjsvCS1FVRabBUu1z186cn07JQd/exec';

let currentUser = null;
let selectedFiles = []; // Almacena objetos de tipo File o Blob
let recordsData = [];

// Variables para el escáner multipágina
let pdfPagesImages = [];
let isMultiPageScan = false;
let currentScanFormat = 'JPG'; // 'JPG' o 'PDF'

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}

document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    setupEventListeners();
});

function setupEventListeners() {
    // Login y Navegación
    document.getElementById('togglePassword').addEventListener('click', togglePass);
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('btnLogout').addEventListener('click', handleLogout);
    document.getElementById('btnDocumentos').addEventListener('click', openDocuments);
    document.getElementById('btnVolver').addEventListener('click', openDashboard);

    // Archivos Drag & Drop estándar
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    
    // NUEVO: Escáner
    document.getElementById('btnScanMobile').addEventListener('click', startMobileScan);
    document.getElementById('btnScanPC').addEventListener('click', startPCScan);
    document.getElementById('cameraInput').addEventListener('change', handleCameraCapture);

    // Subida y Filtros
    document.getElementById('btnUpload').addEventListener('click', uploadFiles);
    document.getElementById('searchInput').addEventListener('input', renderTable);
    document.getElementById('filterYear').addEventListener('change', renderTable);
    document.getElementById('filterMonth').addEventListener('change', renderTable);
    document.getElementById('filterDay').addEventListener('change', renderTable);
}

// ==========================================
// SESIÓN Y NAVEGACIÓN
// ==========================================
function checkSession() {
    const savedUser = localStorage.getItem('session_compukelc');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showView('dashboardView');
        loadFolders(); 
    } else {
        const remembered = localStorage.getItem('remember_user');
        if(remembered) {
            document.getElementById('username').value = remembered;
            document.getElementById('rememberMe').checked = true;
        }
    }
}

function togglePass() {
    const pass = document.getElementById('password');
    pass.type = pass.type === 'password' ? 'text' : 'password';
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    btn.disabled = true; btn.innerText = "Verificando...";
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    const remember = document.getElementById('rememberMe').checked;

    try {
        const resp = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'login', user: user, pass: pass }) });
        const data = await resp.json();
        if (data.success) {
            currentUser = data.userData;
            localStorage.setItem('session_compukelc', JSON.stringify(currentUser));
            if (remember) localStorage.setItem('remember_user', user); else localStorage.removeItem('remember_user');
            showView('dashboardView'); loadFolders();
        } else { document.getElementById('loginError').innerText = data.message; }
    } catch (error) { document.getElementById('loginError').innerText = "Error de conexión"; }
    btn.disabled = false; btn.innerText = "Ingresar";
}

function handleLogout() {
    localStorage.removeItem('session_compukelc');
    currentUser = null; document.getElementById('password').value = '';
    showView('loginView');
}

function showView(viewId) {
    document.querySelectorAll('.view-container').forEach(v => v.classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');
}

// ==========================================
// GESTIÓN DE ARCHIVOS ESTÁNDAR
// ==========================================
function handleFiles(files) {
    const newFiles = Array.from(files);
    selectedFiles = selectedFiles.concat(newFiles);
    updateFileList();
}

function updateFileList() {
    const list = document.getElementById('fileList');
    list.innerHTML = '';
    selectedFiles.forEach((file, index) => {
        list.innerHTML += `<div class="file-item">
            <span>${file.name}</span>
            <span>${(file.size / 1024 / 1024).toFixed(2)} MB</span>
        </div>`;
    });
    document.getElementById('btnUpload').disabled = selectedFiles.length === 0;
}

// ==========================================
// LÓGICA DE ESCÁNER (CÁMARA / PC)
// ==========================================
function startPCScan() {
    alert("Por seguridad web, no es posible controlar el escáner físico desde el navegador.\n\nPor favor, usa el programa de tu PC para escanear el documento, guárdalo y luego selecciónalo aquí.");
    document.getElementById('fileInput').click();
}

function startMobileScan() {
    const format = prompt("¿Qué formato deseas escanear?\nEscribe '1' para JPG\nEscribe '2' para PDF (1 pág)\nEscribe '3' para PDF (Multi-página)", "1");
    if (!format) return;

    if (format === '1') {
        currentScanFormat = 'JPG';
        isMultiPageScan = false;
        document.getElementById('cameraInput').click();
    } else if (format === '2') {
        currentScanFormat = 'PDF';
        isMultiPageScan = false;
        document.getElementById('cameraInput').click();
    } else if (format === '3') {
        currentScanFormat = 'PDF';
        isMultiPageScan = true;
        pdfPagesImages = [];
        alert("Escáner Multi-página iniciado. Toma la primera foto.");
        document.getElementById('cameraInput').click();
    } else {
        alert("Opción no válida.");
    }
}

async function handleCameraCapture(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (currentScanFormat === 'JPG') {
        const d = new Date();
        const customName = `Escaneo_${d.getTime()}.jpg`;
        const renamedFile = new File([file], customName, { type: file.type });
        selectedFiles.push(renamedFile);
        updateFileList();
        e.target.value = ''; 
    } else if (currentScanFormat === 'PDF') {
        const compressedBase64 = await compressImageToBase64(file);
        pdfPagesImages.push(compressedBase64);

        if (isMultiPageScan) {
            const addMore = confirm("Página capturada con éxito.\n¿Deseas añadir otra página al mismo PDF?");
            if (addMore) {
                e.target.value = ''; 
                document.getElementById('cameraInput').click();
            } else {
                generatePDFfromImages();
            }
        } else {
            generatePDFfromImages();
        }
    }
}

async function compressImageToBase64(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const MAX_WIDTH = 1200;
                let width = img.width; let height = img.height;
                if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                canvas.width = width; canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
        };
    });
}

function generatePDFfromImages() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    pdfPagesImages.forEach((imgData, index) => {
        if (index > 0) doc.addPage();
        doc.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight);
    });

    const pdfBlob = doc.output('blob');
    const d = new Date();
    const pdfFile = new File([pdfBlob], `Documento_Escaneado_${d.getTime()}.pdf`, { type: 'application/pdf' });
    
    selectedFiles.push(pdfFile);
    updateFileList();
    
    pdfPagesImages = [];
    document.getElementById('cameraInput').value = '';
    alert("PDF generado y listo para subir.");
}

// ==========================================
// SUBIDA DE ARCHIVOS A GAS
// ==========================================
async function processFileForUpload(file) {
    return new Promise((resolve) => {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const MAX_WIDTH = 1200;
                    let width = img.width; let height = img.height;
                    if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                    canvas.width = width; canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve({ base64: canvas.toDataURL('image/jpeg', 0.7).split(',')[1], mimeType: 'image/jpeg', name: file.name });
                };
            };
        } else {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve({ base64: reader.result.split(',')[1], mimeType: file.type, name: file.name });
        }
    });
}

async function uploadFiles() {
    const folder = document.getElementById('folderInput').value.trim();
    if (!folder) return alert("Ingresa un nombre de carpeta");
    
    const status = document.getElementById('uploadStatus');
    const btn = document.getElementById('btnUpload');
    btn.disabled = true;
    
    for (let i = 0; i < selectedFiles.length; i++) {
        status.innerText = `Subiendo ${i+1} de ${selectedFiles.length}...`;
        const fileData = await processFileForUpload(selectedFiles[i]);
        
        try {
            await fetch(API_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'upload', folderName: folder, fileName: fileData.name, mimeType: fileData.mimeType, base64: fileData.base64 })
            });
        } catch (e) { console.error("Error al subir", e); }
    }
    status.innerText = "¡Subida completada!";
    selectedFiles = [];
    updateFileList();
    document.getElementById('folderInput').value = '';
    setTimeout(() => { status.innerText = ''; }, 3000);
}

// ==========================================
// VISUALIZADOR Y FILTROS
// ==========================================
async function loadFolders() {
    try {
        const resp = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getFolders' }) });
        const data = await resp.json();
        if (data.success) {
            const datalist = document.getElementById('folderOptions');
            datalist.innerHTML = '';
            data.folders.forEach(f => { datalist.innerHTML += `<option value="${f}">`; });
        }
    } catch(e) {}
}

async function openDocuments() {
    showView('documentsView');
    const tbody = document.getElementById('recordsBody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Cargando...</td></tr>';
    try {
        const resp = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getRecords' }) });
        const data = await resp.json();
        if (data.success) { recordsData = data.records; populateFilters(); renderTable(); }
    } catch(e) { tbody.innerHTML = '<tr><td colspan="4">Error cargando registros</td></tr>'; }
}

function openDashboard() { showView('dashboardView'); }

function populateFilters() {
    const years = new Set(), months = new Set(), days = new Set();
    recordsData.forEach(r => {
        if (!r.fecha) return;
        const date = new Date(r.fecha);
        years.add(date.getFullYear()); months.add(date.getMonth() + 1); days.add(date.getDate());
    });
    fillSelect('filterYear', years, 'Todos los Años'); fillSelect('filterMonth', months, 'Todos los Meses'); fillSelect('filterDay', days, 'Todos los Días');
}

function fillSelect(id, setValues, defaultText) {
    const sel = document.getElementById(id);
    sel.innerHTML = `<option value="ALL">${defaultText}</option>`;
    Array.from(setValues).sort((a,b)=>a-b).forEach(val => { sel.innerHTML += `<option value="${val}">${val}</option>`; });
}

function removeAccents(str) { return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }

function renderTable() {
    const sTerm = removeAccents(document.getElementById('searchInput').value);
    const fYear = document.getElementById('filterYear').value; const fMonth = document.getElementById('filterMonth').value; const fDay = document.getElementById('filterDay').value;
    const tbody = document.getElementById('recordsBody'); tbody.innerHTML = '';
    
    const filtered = recordsData.filter(r => {
        const date = new Date(r.fecha);
        const matchYear = fYear === 'ALL' || date.getFullYear().toString() === fYear;
        const matchMonth = fMonth === 'ALL' || (date.getMonth()+1).toString() === fMonth;
        const matchDay = fDay === 'ALL' || date.getDate().toString() === fDay;
        const matchSearch = removeAccents(`${r.nombre} ${r.carpeta}`).includes(sTerm);
        return matchYear && matchMonth && matchDay && matchSearch;
    });
    
    filtered.forEach(r => {
        const d = new Date(r.fecha);
        tbody.innerHTML += `<tr><td>${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}</td><td>${r.nombre}</td><td>${r.carpeta}</td><td><a href="${r.url}" target="_blank">Ver 🔗</a></td></tr>`;
    });
}
