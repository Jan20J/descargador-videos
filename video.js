// --- Elementos del DOM ---
const platformSelect = document.getElementById("platform");
const urlInput = document.getElementById("url");
const qualitySelect = document.getElementById("quality");
const getInfoBtn = document.getElementById("getInfoBtn");
const downloadBtn = document.getElementById("downloadBtn");
const resultMessage = document.getElementById("resultMessage");

// --- Variable global para guardar el nombre del archivo ---
let videoFilename = "video.mp4";

/**
 * Muestra un mensaje de estado o error en la interfaz.
 * @param {string} mensaje El texto a mostrar.
 * @param {'success' | 'error' | 'info'} tipo El tipo de mensaje.
 */
function mostrarMensaje(mensaje, tipo) {
    resultMessage.textContent = mensaje;
    resultMessage.classList.remove("hidden");

    const typeClasses = {
        success: "bg-green-100 text-green-700 border-green-200",
        error: "bg-red-100 text-red-700 border-red-200",
        info: "bg-blue-100 text-blue-700 border-blue-200",
    };
    
    resultMessage.className = `mt-4 p-4 rounded-lg text-center border ${typeClasses[tipo] || typeClasses.info}`;
}

/**
 * Habilita o deshabilita los botones principales para evitar acciones duplicadas.
 * @param {boolean} isLoading Si es verdadero, deshabilita los botones.
 */
function setLoadingState(isLoading) {
    getInfoBtn.disabled = isLoading;
    downloadBtn.disabled = isLoading;
    getInfoBtn.innerHTML = isLoading ? '<i class="fas fa-spinner fa-spin"></i>' : '<i class="fas fa-search"></i>';
}

/**
 * Obtiene la información del video desde el backend y puebla el selector de calidad.
 */
async function actualizarCalidades() {
    const url = urlInput.value.trim();
    if (!url) {
        mostrarMensaje("Por favor, ingresa una URL.", "error");
        return;
    }

    setLoadingState(true);
    mostrarMensaje("Buscando información del video...", "info");
    qualitySelect.innerHTML = '<option value="">Cargando calidades...</option>';

    try {
        const formData = new FormData();
        formData.append("url", url);

        const response = await fetch("https://descargador-api-jan.onrender.com/info", {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            // Intenta leer el error detallado del backend
            const errorData = await response.json();
            throw new Error(errorData.detail || `Error del servidor: ${response.status}`);
        }

        const data = await response.json();
        videoFilename = `${data.title}.mp4`; // Guardar el nombre del archivo

        qualitySelect.innerHTML = '<option value="">Selecciona la calidad</option>';
        if (data.formats.length === 0) {
            qualitySelect.innerHTML = '<option value="">No hay calidades disponibles</option>';
            throw new Error("No se encontraron formatos de video compatibles.");
        }

        data.formats.forEach((format) => {
            const option = document.createElement("option");
            option.value = format.format_id;
            const fileSize = format.filesize ? `(${(format.filesize / 1024 / 1024).toFixed(2)} MB)` : '';
            option.textContent = `${format.quality} (${format.ext}) ${fileSize}`;
            qualitySelect.appendChild(option);
        });

        mostrarMensaje("Calidades encontradas. ¡Listo para descargar!", "success");

    } catch (error) {
        mostrarMensaje(`Error al obtener calidades: ${error.message}`, "error");
        qualitySelect.innerHTML = '<option value="">Error al cargar</option>';
    } finally {
        setLoadingState(false);
    }
}

/**
 * Descarga el video con el formato seleccionado.
 */
async function descargarVideo() {
    const url = urlInput.value.trim();
    const format_id = qualitySelect.value;

    if (!url || !format_id) {
        mostrarMensaje("Asegúrate de haber buscado una URL y seleccionado una calidad.", "error");
        return;
    }

    setLoadingState(true);
    downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Descargando...';
    mostrarMensaje("Iniciando la descarga, por favor espera...", "info");

    try {
        const formData = new FormData();
        formData.append("url", url);
        formData.append("format_id", format_id);

        const response = await fetch("https://descargador-api-jan.onrender.com/download", {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `Error del servidor: ${response.status}`);
        }

        const blob = await response.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = videoFilename; // Usar el nombre de archivo guardado
        document.body.appendChild(a);
        a.click();
        
        // Limpieza
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
        
        mostrarMensaje("¡Descarga completada!", "success");

    } catch (error) {
        mostrarMensaje(`Error al descargar el video: ${error.message}`, "error");
    } finally {
        setLoadingState(false);
        downloadBtn.innerHTML = '<i class="fas fa-download mr-2"></i>Descargar Video';
    }
}