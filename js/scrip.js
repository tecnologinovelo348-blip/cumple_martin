// scrip.js (versión con Firebase + localStorage fallback + QR + galería pública)

// ---------- CONFIGURA TU FIREBASE AQUÍ ----------
const firebaseConfig = {
    apiKey: "TU_API_KEY",
    authDomain: "TU_AUTH_DOMAIN",
    projectId: "TU_PROJECT_ID",
    storageBucket: "TU_STORAGE_BUCKET",
    messagingSenderId: "TU_MSG_SENDER_ID",
    appId: "TU_APP_ID"
};
// Reemplaza los valores con los de tu web app en Firebase

// Inicializar Firebase (compat)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

// ---------- Variables globales ----------
let slideActual = 0;
let totalSlides = 0;
let mensajeEditando = null;
let fotoEliminando = null;
let musicaReproduciendo = false;
const fotosIniciales = [ /* deja tus URLs iniciales si quieres */];
const mensajesIniciales = [ /* puedes mantener tus iniciales si quieres */];

document.addEventListener('DOMContentLoaded', function () {
    console.log('DOM cargado - Iniciando aplicación');
    iniciarListenersFirestore();
    cargarMensajesIniciales(); // usa Firestore o localStorage segun disponibilidad
    cargarFotosIniciales();    // idem
    iniciarConfeti();
    configurarMusica();
    iniciarFuegosArtificiales();
    generarQRGaleryButton(); // crea QR (ver función)
    console.log('Aplicación inicializada');
});


// ---------------- FIREBASE: listeners en tiempo real ----------------
function iniciarListenersFirestore() {
    // Fotos - colección 'fotos' ordenadas por timestamp
    db.collection('fotos').orderBy('timestamp').onSnapshot(snapshot => {
        console.log('Actualización fotos desde Firestore', snapshot.docs.length);
        const fotos = [];
        snapshot.forEach(doc => fotos.push(doc.data().url));
        if (fotos.length > 0) {
            // Guardar localmente también
            localStorage.setItem('fotosGuardadas', JSON.stringify(fotos));
            renderizarFotosDesdeArray(fotos);
        } else {
            // si no hay fotos en Firestore, usa fallback localStorage o iniciales
            const guardadas = JSON.parse(localStorage.getItem('fotosGuardadas')) || fotosIniciales;
            renderizarFotosDesdeArray(guardadas);
        }
    }, err => {
        console.warn('No se pudo escuchar fotos (Firestore):', err);
        // fallback: localStorage
        const guardadas = JSON.parse(localStorage.getItem('fotosGuardadas')) || fotosIniciales;
        renderizarFotosDesdeArray(guardadas);
    });

    // Mensajes - colección 'mensajes' ordenada por timestamp
    db.collection('mensajes').orderBy('timestamp').onSnapshot(snapshot => {
        console.log('Actualización mensajes desde Firestore', snapshot.docs.length);
        const mensajes = [];
        snapshot.forEach(doc => mensajes.push({ id: doc.id, ...doc.data() }));
        if (mensajes.length > 0) {
            localStorage.setItem('mensajesGuardados', JSON.stringify(mensajes));
            renderizarMensajesDesdeArray(mensajes);
        } else {
            const guardados = JSON.parse(localStorage.getItem('mensajesGuardados')) || mensajesIniciales;
            renderizarMensajesDesdeArray(guardados);
        }
    }, err => {
        console.warn('No se pudo escuchar mensajes (Firestore):', err);
        const guardados = JSON.parse(localStorage.getItem('mensajesGuardados')) || mensajesIniciales;
        renderizarMensajesDesdeArray(guardados);
    });
}


// ---------------- SUBIDA de foto a Firebase Storage y registro en Firestore ----------------
async function subirFotoAFirebase(archivo) {
    if (!archivo) throw new Error('Archivo vacío');

    const timestamp = Date.now();
    const nombre = `fotos/${timestamp}_${archivo.name}`;
    const refStorage = storage.ref().child(nombre);

    // Subida
    const snapshot = await refStorage.put(archivo);
    const url = await snapshot.ref.getDownloadURL();

    // Guardar metadata en Firestore
    await db.collection('fotos').add({
        url,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    return url;
}


// ---------------- FUNCIONES DE RENDER / DOM para fotos y mensajes ----------------
function renderizarFotosDesdeArray(arrayFotos) {
    const track = document.getElementById('carrusel-track');
    if (!track) return;
    track.innerHTML = '';
    arrayFotos.forEach((src, index) => agregarFotoAlDOM(src, index));
    actualizarTotalSlides();
    actualizarIndicadores();
}

function renderizarMensajesDesdeArray(arrayMensajes) {
    const container = document.getElementById('mensajes-container');
    if (!container) return;
    container.innerHTML = '';
    arrayMensajes.forEach(m => {
        // si el objeto viene con id o sin id, lo manejamos
        const mensaje = {
            id: m.id || Date.now() + Math.random(),
            autor: m.autor || m.nombre || m.autor || 'Anonimo',
            texto: m.texto || m.mensaje || ''
        };
        agregarMensajeAlDOM(mensaje);
    });
}


// ---------------- Funciones de fotos (añadir / borrar) ----------------
function cargarFotosIniciales() {
    console.log('Cargando fotos iniciales...');
    // Intentamos usar lo guardado localmente (fallback si Firestore falla)
    const guardadas = JSON.parse(localStorage.getItem('fotosGuardadas'));
    if (guardadas && guardadas.length > 0) {
        renderizarFotosDesdeArray(guardadas);
        return;
    }
    // Si no hay guardadas aún, muestra las iniciales
    renderizarFotosDesdeArray(fotosIniciales);
}

function agregarFotoAlDOM(src, index) {
    const track = document.getElementById('carrusel-track');
    if (!track) return;

    const slide = document.createElement('div');
    slide.className = 'carrusel-slide';
    slide.dataset.index = index;

    slide.innerHTML = `
        <img src="${src}" alt="Recuerdo ${index + 1}" onerror="this.src='https://via.placeholder.com/800x500?text=Imagen+no+disponible'">
        <button class="eliminar-foto" onclick="eliminarFoto(${index})" title="Eliminar foto">
            <i class="fas fa-trash"></i>
        </button>
    `;

    track.appendChild(slide);
}

function agregarFoto() {
    const inputFoto = document.getElementById('input-foto');
    const archivo = inputFoto.files[0];
    if (!archivo) { alert('Por favor, selecciona una foto'); return; }

    // Subimos a Firebase Storage y luego guardamos en Firestore
    subirFotoAFirebase(archivo).then(url => {
        console.log('Foto subida y guardada en Firestore:', url);
        // localStorage guardará automáticamente gracias al listener de Firestore
        inputFoto.value = '';
        crearConfeti();
    }).catch(err => {
        console.error('Error subiendo foto:', err);
        alert('Error subiendo la foto. Se guardará localmente como fallback.');

        // fallback: guardar en localStorage como dataURL
        const reader = new FileReader();
        reader.onload = function (e) {
            const src = e.target.result;
            const guardadas = JSON.parse(localStorage.getItem('fotosGuardadas')) || fotosIniciales.slice();
            guardadas.push(src);
            localStorage.setItem('fotosGuardadas', JSON.stringify(guardadas));
            renderizarFotosDesdeArray(guardadas);
            inputFoto.value = '';
        };
        reader.readAsDataURL(archivo);
    });
}

function eliminarFoto(index) {
    fotoEliminando = index;
    document.getElementById('modal-eliminar-foto').style.display = 'block';
}

function confirmarEliminarFoto() {
    // Para eliminar en Firestore buscamos la foto por URL y la borramos
    const slide = document.querySelector(`[data-index="${fotoEliminando}"]`);
    if (slide) {
        const img = slide.querySelector('img');
        const url = img ? img.src : null;

        // Intentamos eliminar el documento de la colección 'fotos'
        db.collection('fotos').where('url', '==', url).get()
            .then(snapshot => {
                const batch = db.batch();
                snapshot.forEach(doc => batch.delete(doc.ref));
                return batch.commit();
            })
            .then(() => {
                console.log('Fotos eliminadas en Firestore (si existían).');
                // Storage: opcional eliminar el archivo en Storage si deseas (requiere extra steps para obtener ruta)
                // Fallback: actualizar localStorage
                const slides = document.querySelectorAll('.carrusel-slide');
                slides.forEach((slide, idx) => {
                    slide.dataset.index = idx;
                    const btnEliminar = slide.querySelector('.eliminar-foto');
                    if (btnEliminar) btnEliminar.setAttribute('onclick', `eliminarFoto(${idx})`);
                });
                actualizarTotalSlides();
                if (slideActual >= totalSlides) slideActual = totalSlides - 1;
                actualizarCarrusel();
            })
            .catch(err => {
                console.warn('No se pudo eliminar de Firestore (fallback a DOM/localStorage):', err);
                // fallback: eliminar del DOM/localStorage
                slide.remove();
                const slides = document.querySelectorAll('.carrusel-slide');
                const fotos = Array.from(slides).map(s => s.querySelector('img').src);
                localStorage.setItem('fotosGuardadas', JSON.stringify(fotos));
                actualizarTotalSlides();
                if (slideActual >= totalSlides) slideActual = totalSlides - 1;
                actualizarCarrusel();
            });
    }
    cerrarModal();
    crearConfeti();
}

// ---------------- Funciones de mensajes (guardar en Firestore + localStorage) ----------------
function cargarMensajesIniciales() {
    const guardados = JSON.parse(localStorage.getItem('mensajesGuardados'));
    if (guardados && guardados.length > 0) {
        renderizarMensajesDesdeArray(guardados);
    } else {
        // usar iniciales hasta que el listener de Firestore aporte datos
        renderizarMensajesDesdeArray(mensajesIniciales);
    }
}

function agregarMensaje() {
    const autor = document.getElementById('autor-mensaje').value.trim();
    const texto = document.getElementById('texto-mensaje').value.trim();
    if (!autor || !texto) { alert('Por favor, completa todos los campos'); return; }

    // Guardar en Firestore
    db.collection('mensajes').add({
        autor,
        texto,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        document.getElementById('autor-mensaje').value = '';
        document.getElementById('texto-mensaje').value = '';
        crearConfeti();
    }).catch(err => {
        console.error('Error guardando mensaje en Firestore:', err);
        // fallback: guardar en localStorage
        const mensajes = JSON.parse(localStorage.getItem('mensajesGuardados')) || [];
        const nuevo = { id: Date.now(), autor, texto };
        mensajes.push(nuevo);
        localStorage.setItem('mensajesGuardados', JSON.stringify(mensajes));
        agregarMensajeAlDOM(nuevo);
        crearConfeti();
    });
}

function agregarMensajeAlDOM(mensaje) {
    const container = document.getElementById('mensajes-container');
    if (!container) return;

    const mensajeDiv = document.createElement('div');
    mensajeDiv.className = 'mensaje';
    mensajeDiv.dataset.id = mensaje.id;

    mensajeDiv.innerHTML = `
        <div class="autor">${mensaje.autor}</div>
        <div class="texto">${mensaje.texto}</div>
        <div class="acciones">
            <button class="btn-accion" onclick="editarMensaje(${mensaje.id})">
                <i class="fas fa-edit"></i> Editar
            </button>
            <button class="btn-accion" onclick="eliminarMensaje(${mensaje.id})">
                <i class="fas fa-trash"></i> Eliminar
            </button>
        </div>
    `;
    container.appendChild(mensajeDiv);
}

// editar/eliminar mensajes: para producción necesitarás guardar el id de Firestore;
// aquí dejo una versión simple que solo hace cambios en DOM/localStorage al no tener id Firestore.
function editarMensaje(id) {
    const mensaje = document.querySelector(`[data-id="${id}"]`);
    if (!mensaje) return;
    const autor = mensaje.querySelector('.autor').textContent;
    const texto = mensaje.querySelector('.texto').textContent;
    document.getElementById('editar-autor').value = autor;
    document.getElementById('editar-texto').value = texto;
    mensajeEditando = id;
    document.getElementById('modal-editar').style.display = 'block';
}

function guardarEdicion() {
    const autor = document.getElementById('editar-autor').value.trim();
    const texto = document.getElementById('editar-texto').value.trim();
    if (!autor || !texto) { alert('Por favor, completa todos los campos'); return; }
    const mensaje = document.querySelector(`[data-id="${mensajeEditando}"]`);
    if (mensaje) {
        mensaje.querySelector('.autor').textContent = autor;
        mensaje.querySelector('.texto').textContent = texto;
    }
    // actualizar localStorage (simple)
    const mensajes = JSON.parse(localStorage.getItem('mensajesGuardados')) || [];
    const idx = mensajes.findIndex(m => m.id === mensajeEditando);
    if (idx >= 0) {
        mensajes[idx].autor = autor;
        mensajes[idx].texto = texto;
        localStorage.setItem('mensajesGuardados', JSON.stringify(mensajes));
    }
    cerrarModal();
    crearConfeti();
}

function eliminarMensaje(id) {
    mensajeEditando = id;
    document.getElementById('modal-eliminar-mensaje').style.display = 'block';
}

function confirmarEliminarMensaje() {
    const mensaje = document.querySelector(`[data-id="${mensajeEditando}"]`);
    if (mensaje) mensaje.remove();
    // actualizar localStorage (simple)
    let mensajes = JSON.parse(localStorage.getItem('mensajesGuardados')) || [];
    mensajes = mensajes.filter(m => m.id !== mensajeEditando);
    localStorage.setItem('mensajesGuardados', JSON.stringify(mensajes));
    cerrarModal();
    crearConfeti();
}

// ---------------- CARRUSEL y utilidades  (mantén tus funciones previas: siguienteSlide, anteriorSlide, actualizarIndicadores, etc.) ----------------
function actualizarTotalSlides() {
    totalSlides = document.querySelectorAll('.carrusel-slide').length;
    console.log('Total de slides:', totalSlides);
}
function actualizarCarrusel() {
    const track = document.getElementById('carrusel-track');
    if (track && totalSlides > 0) {
        track.style.transform = `translateX(-${slideActual * 100}%)`;
    }
    actualizarIndicadores();
}
function siguienteSlide() {
    actualizarTotalSlides();
    if (totalSlides > 0) {
        slideActual = (slideActual + 1) % totalSlides;
        actualizarCarrusel();
    }
}
function anteriorSlide() {
    actualizarTotalSlides();
    if (totalSlides > 0) {
        slideActual = (slideActual - 1 + totalSlides) % totalSlides;
        actualizarCarrusel();
    }
}
function irASlide(indice) { slideActual = indice; actualizarCarrusel(); }
function actualizarIndicadores() {
    actualizarTotalSlides();
    const indicadoresContainer = document.getElementById('carrusel-indicadores');
    if (!indicadoresContainer) return;
    indicadoresContainer.innerHTML = '';
    const slides = document.querySelectorAll('.carrusel-slide');
    slides.forEach((_, indice) => {
        const indicador = document.createElement('div');
        indicador.className = 'indicador';
        if (indice === slideActual) indicador.classList.add('activo');
        indicador.addEventListener('click', () => irASlide(indice));
        indicadoresContainer.appendChild(indicador);
    });
}

// ---------------- Modal y utilidades visuales (mantén tus funciones existentes) ----------------
function cerrarModal() {
    const modales = document.querySelectorAll('.modal');
    modales.forEach(modal => modal.style.display = 'none');
    mensajeEditando = null; fotoEliminando = null;
}

// (mantén crearConfeti, iniciarConfeti, fuegos artificiales, música, etc.)
// ... pega aquí el resto de tus funciones visuales existentes (crearConfeti, iniciarConfeti, iniciarFuegosArtificiales, configurarMusica, iniciarMusica, pausarMusica, toggleMusica, etc.)

// ---------------- Generar QR que apunta a la galería pública ----------------
function generarQRGaleryButton() {
    // Crea un contenedor (si no existe) para el QR en alguna parte de la UI.
    // Aquí lo crearé debajo del elemento #inicio por ejemplo.
    const inicio = document.getElementById('inicio');
    if (!inicio) return;
    const cont = document.createElement('div');
    cont.id = 'qr-galeria-container';
    cont.style.position = 'fixed';
    cont.style.bottom = '20px';
    cont.style.right = '20px';
    cont.style.background = 'rgba(255,255,255,0.9)';
    cont.style.padding = '10px';
    cont.style.borderRadius = '10px';
    cont.style.boxShadow = '0 8px 20px rgba(0,0,0,0.2)';
    cont.innerHTML = `<div id="qrcode" style="width:120px;height:120px;"></div><div style="text-align:center;font-size:0.8rem;margin-top:5px">Galería pública</div>`;
    document.body.appendChild(cont);

    // URL pública (cámbiala por la URL real donde alojes gallery.html)
    // Si usas Firebase Hosting p.ej: "https://tu-proyecto.web.app/gallery.html"
    const urlGaleriaPublica = window.location.origin + '/gallery.html'; // modifica si es necesario

    // Generar QR
    new QRCode(document.getElementById("qrcode"), {
        text: urlGaleriaPublica,
        width: 120,
        height: 120
    });
}







// Inicialización
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM cargado - Iniciando aplicación');
    cargarMensajesIniciales();
    cargarFotosIniciales();
    iniciarConfeti();
    configurarMusica();
    iniciarFuegosArtificiales();
    console.log('Aplicación inicializada');
});

// Funciones de navegación
function mostrarSeccion(seccionId) {
    console.log('Mostrando sección:', seccionId);
    const secciones = document.querySelectorAll('.section');
    secciones.forEach(seccion => {
        seccion.classList.remove('active');
    });
    
    const seccionActual = document.getElementById(seccionId);
    if (seccionActual) {
        seccionActual.classList.add('active');
        console.log('Sección activada:', seccionId);
    } else {
        console.error('No se encontró la sección:', seccionId);
    }
    
    // Controlar música según la sección
    if (seccionId === 'recuerdos') {
        iniciarMusica();
    } else {
        pausarMusica();
    }
    
    // Controlar fuegos artificiales según la sección
    if (seccionId === 'inicio') {
        iniciarFuegosArtificiales();
    } else {
        detenerFuegosArtificiales();
    }
    
    // Controlar fuegos en forma de corazón según la sección
    if (seccionId === 'gracias') {
        iniciarFuegosCorazon();
    } else {
        detenerFuegosCorazon();
    }
    
    // Forzar carga de datos al cambiar de sección
    if (seccionId === 'mensajes') {
        setTimeout(() => {
            const container = document.getElementById('mensajes-container');
            if (container && container.children.length === 0) {
                console.log('Recargando mensajes...');
                cargarMensajesIniciales();
            }
        }, 100);
    }
    
    if (seccionId === 'recuerdos') {
        setTimeout(() => {
            const track = document.getElementById('carrusel-track');
            if (track && track.children.length === 0) {
                console.log('Recargando fotos...');
                cargarFotosIniciales();
            }
            actualizarIndicadores();
        }, 100);
    }
}

// Funciones de fuegos artificiales mejorados
function iniciarFuegosArtificiales() {
    detenerFuegosArtificiales();
    console.log('Iniciando fuegos artificiales');
    fuegosArtificialesInterval = setInterval(crearFuegoArtificialMejorado, 600);
}

function detenerFuegosArtificiales() {
    if (fuegosArtificialesInterval) {
        clearInterval(fuegosArtificialesInterval);
        fuegosArtificialesInterval = null;
        console.log('Deteniendo fuegos artificiales');
    }
}

function crearFuegoArtificialMejorado() {
    const container = document.getElementById('fuegos-artificiales');
    if (!container) {
        console.error('No se encontró el contenedor de fuegos artificiales');
        return;
    }
    
    const colores = ['#ff6b6b', '#4834d4', '#00d2d3', '#ff9f43', '#10ac84', '#ee5a24', '#0abde3', '#ff9ff3', '#ff3838', '#00b894', '#FFD700', '#FF69B4'];
    
    const cohete = document.createElement('div');
    cohete.className = 'fuego-artificial';
    cohete.style.left = Math.random() * 100 + '%';
    cohete.style.bottom = '0px';
    cohete.style.color = colores[Math.floor(Math.random() * colores.length)];
    
    const altura = Math.random() * 70 + 15;
    cohete.style.setProperty('--altura', `-${altura}vh`);
    
    const duracionSubida = Math.random() * 0.8 + 0.4;
    cohete.style.animation = `lanzar-fuego ${duracionSubida}s ease-out forwards`;
    
    container.appendChild(cohete);
    
    setTimeout(() => {
        crearExplosionMejorada(cohete.offsetLeft, window.innerHeight - (window.innerHeight * altura / 100), cohete.style.color);
        cohete.remove();
    }, duracionSubida * 1000);
}

function crearExplosionMejorada(x, y, color) {
    const container = document.getElementById('fuegos-artificiales');
    if (!container) return;
    
    const numParticulas = Math.floor(Math.random() * 25) + 20;
    
    for (let anillo = 0; anillo < 3; anillo++) {
        setTimeout(() => {
            for (let i = 0; i < numParticulas / 3; i++) {
                const particula = document.createElement('div');
                particula.className = 'fuego-artificial';
                particula.style.left = x + 'px';
                particula.style.top = y + 'px';
                particula.style.color = color;
                
                const angulo = (Math.PI * 2 * i) / (numParticulas / 3);
                const distancia = (Math.random() * 80 + 40) * (anillo + 1);
                
                const dx = Math.cos(angulo) * distancia;
                const dy = Math.sin(angulo) * distancia;
                
                particula.style.setProperty('--dx', dx + 'px');
                particula.style.setProperty('--dy', dy + 'px');
                
                const duracionExplosion = Math.random() * 0.6 + 0.4;
                particula.style.animation = `explotar ${duracionExplosion}s ease-out forwards`;
                
                container.appendChild(particula);
                
                setTimeout(() => {
                    particula.remove();
                }, duracionExplosion * 1000);
            }
        }, anillo * 100);
    }
    
    const destello = document.createElement('div');
    destello.style.position = 'absolute';
    destello.style.left = x + 'px';
    destello.style.top = y + 'px';
    destello.style.width = '20px';
    destello.style.height = '20px';
    destello.style.borderRadius = '50%';
    destello.style.background = `radial-gradient(circle, ${color}, transparent)`;
    destello.style.transform = 'translate(-50%, -50%)';
    destello.style.animation = 'destello 0.5s ease-out forwards';
    
    container.appendChild(destello);
    
    setTimeout(() => {
        destello.remove();
    }, 500);
}

// Funciones de fuegos artificiales en forma de corazón
function iniciarFuegosCorazon() {
    detenerFuegosCorazon();
    console.log('Iniciando fuegos en forma de corazón');
    fuegosCorazonInterval = setInterval(crearFuegosCorazon, 800);
}

function detenerFuegosCorazon() {
    if (fuegosCorazonInterval) {
        clearInterval(fuegosCorazonInterval);
        fuegosCorazonInterval = null;
        console.log('Deteniendo fuegos en forma de corazón');
    }
}

function crearFuegosCorazon() {
    const container = document.getElementById('fuegos-corazon');
    if (!container) {
        console.error('No se encontró el contenedor de fuegos corazón');
        return;
    }
    
    const colores = ['#ff6b6b', '#ff3838', '#ff1744', '#d32f2f', '#f44336'];
    
    // Crear forma de corazón con fuegos artificiales
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const size = Math.min(window.innerWidth, window.innerHeight) * 0.3;
    
    for (let i = 0; i < 30; i++) {
        const t = (i / 30) * Math.PI * 2;
        const x = centerX + size * (16 * Math.pow(Math.sin(t), 3)) / 16;
        const y = centerY - size * (13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t)) / 16;
        
        const fuego = document.createElement('div');
        fuego.className = 'fuego-corazon';
        fuego.style.left = x + 'px';
        fuego.style.top = y + 'px';
        fuego.style.color = colores[Math.floor(Math.random() * colores.length)];
        fuego.style.animation = `corazon-latido ${Math.random() * 2 + 1}s infinite`;
        
        container.appendChild(fuego);
        
        setTimeout(() => {
            fuego.remove();
        }, 3000);
    }
}

// Funciones de mensajes
function cargarMensajesIniciales() {
    console.log('Cargando mensajes iniciales...');
    const container = document.getElementById('mensajes-container');
    if (!container) {
        console.error('No se encontró el contenedor de mensajes');
        return;
    }
    
    container.innerHTML = '';
    
    mensajesIniciales.forEach(mensaje => {
        agregarMensajeAlDOM(mensaje);
    });
    
    console.log('Mensajes iniciales cargados:', mensajesIniciales.length);
}

function agregarMensaje() {
    const autor = document.getElementById('autor-mensaje').value;
    const texto = document.getElementById('texto-mensaje').value;
    
    if (autor.trim() === '' || texto.trim() === '') {
        alert('Por favor, completa todos los campos');
        return;
    }
    
    const nuevoMensaje = {
        id: Date.now(),
        autor: autor,
        texto: texto
    };
    
    agregarMensajeAlDOM(nuevoMensaje);
    
    document.getElementById('autor-mensaje').value = '';
    document.getElementById('texto-mensaje').value = '';
    
    crearConfeti();
}

function agregarMensajeAlDOM(mensaje) {
    const container = document.getElementById('mensajes-container');
    if (!container) {
        console.error('No se encontró el contenedor de mensajes');
        return;
    }
    
    const mensajeDiv = document.createElement('div');
    mensajeDiv.className = 'mensaje';
    mensajeDiv.dataset.id = mensaje.id;
    
    mensajeDiv.innerHTML = `
        <div class="autor">${mensaje.autor}</div>
        <div class="texto">${mensaje.texto}</div>
        <div class="acciones">
            <button class="btn-accion" onclick="editarMensaje(${mensaje.id})">
                <i class="fas fa-edit"></i> Editar
            </button>
            <button class="btn-accion" onclick="eliminarMensaje(${mensaje.id})">
                <i class="fas fa-trash"></i> Eliminar
            </button>
        </div>
    `;
    
    container.appendChild(mensajeDiv);
    console.log('Mensaje agregado:', mensaje);
}

function editarMensaje(id) {
    const mensaje = document.querySelector(`[data-id="${id}"]`);
    if (!mensaje) return;
    
    const autor = mensaje.querySelector('.autor').textContent;
    const texto = mensaje.querySelector('.texto').textContent;
    
    document.getElementById('editar-autor').value = autor;
    document.getElementById('editar-texto').value = texto;
    
    mensajeEditando = id;
    document.getElementById('modal-editar').style.display = 'block';
}

function guardarEdicion() {
    const autor = document.getElementById('editar-autor').value;
    const texto = document.getElementById('editar-texto').value;
    
    if (autor.trim() === '' || texto.trim() === '') {
        alert('Por favor, completa todos los campos');
        return;
    }
    
    const mensaje = document.querySelector(`[data-id="${mensajeEditando}"]`);
    if (mensaje) {
        mensaje.querySelector('.autor').textContent = autor;
        mensaje.querySelector('.texto').textContent = texto;
    }
    
    cerrarModal();
    crearConfeti();
}

function eliminarMensaje(id) {
    mensajeEditando = id;
    document.getElementById('modal-eliminar-mensaje').style.display = 'block';
}

function confirmarEliminarMensaje() {
    const mensaje = document.querySelector(`[data-id="${mensajeEditando}"]`);
    if (mensaje) {
        mensaje.remove();
    }
    cerrarModal();
    crearConfeti();
}

function cargarFotosIniciales() {
    console.log('Cargando fotos iniciales...');
    const track = document.getElementById('carrusel-track');
    if (!track) {
        console.error('No se encontró el track del carrusel');
        return;
    }

    track.innerHTML = '';

    const fotosGuardadas = obtenerFotosGuardadas();
    const fotosACargar = fotosGuardadas || fotosIniciales;

    fotosACargar.forEach((foto, index) => {
        agregarFotoAlDOM(foto, index);
    });

    actualizarTotalSlides();
    actualizarIndicadores();
    console.log('Fotos cargadas:', fotosACargar.length);
}

// ===== FUNCIONES PARA GUARDAR Y CARGAR FOTOS =====

function guardarFotosEnLocalStorage() {
    const slides = document.querySelectorAll('.carrusel-slide img');
    const fotos = [];

    slides.forEach(img => {
        fotos.push(img.src);
    });

    localStorage.setItem('fotosGuardadas', JSON.stringify(fotos));
}

function obtenerFotosGuardadas() {
    const guardadas = JSON.parse(localStorage.getItem('fotosGuardadas'));
    return guardadas && guardadas.length > 0 ? guardadas : null;
}


function agregarFotoAlDOM(src, index) {
    const track = document.getElementById('carrusel-track');
    if (!track) {
        console.error('No se encontró el track del carrusel');
        return;
    }
    
    const slide = document.createElement('div');
    slide.className = 'carrusel-slide';
    slide.dataset.index = index;
    
    slide.innerHTML = `
        <img src="${src}" alt="Recuerdo ${index + 1}" onerror="this.src='https://via.placeholder.com/800x500?text=Imagen+no+disponible'">
        <button class="eliminar-foto" onclick="eliminarFoto(${index})" title="Eliminar foto">
            <i class="fas fa-trash"></i>
        </button>
    `;
    
    track.appendChild(slide);
    console.log('Foto agregada:', src);
}

function agregarFoto() {
    const inputFoto = document.getElementById('input-foto');
    const archivo = inputFoto.files[0];

    if (!archivo) {
        alert('Por favor, selecciona una foto');
        return;
    }

    const reader = new FileReader();

    reader.onload = function (e) {
        const track = document.getElementById('carrusel-track');
        if (!track) return;

        const nuevoIndex = track.children.length;

        agregarFotoAlDOM(e.target.result, nuevoIndex);

        actualizarTotalSlides();
        slideActual = totalSlides - 1;
        actualizarCarrusel();

        // ✅ Guardar cambio
        guardarFotosEnLocalStorage();

        inputFoto.value = '';
        crearConfeti();
    };

    reader.readAsDataURL(archivo);
}


function eliminarFoto(index) {
    fotoEliminando = index;
    document.getElementById('modal-eliminar-foto').style.display = 'block';
}

function confirmarEliminarFoto() {
    const slide = document.querySelector(`[data-index="${fotoEliminando}"]`);
    if (slide) {
        slide.remove();

        const slides = document.querySelectorAll('.carrusel-slide');
        slides.forEach((slide, index) => {
            slide.dataset.index = index;
            const btnEliminar = slide.querySelector('.eliminar-foto');
            if (btnEliminar) {
                btnEliminar.setAttribute('onclick', `eliminarFoto(${index})`);
            }
        });

        actualizarTotalSlides();
        if (slideActual >= totalSlides) {
            slideActual = totalSlides - 1;
        }
        actualizarCarrusel();

        // ✅ Guardar cambio
        guardarFotosEnLocalStorage();
    }

    cerrarModal();
    crearConfeti();
}


// Funciones del carrusel
function actualizarTotalSlides() {
    totalSlides = document.querySelectorAll('.carrusel-slide').length;
    console.log('Total de slides:', totalSlides);
}

function actualizarCarrusel() {
    const track = document.getElementById('carrusel-track');
    if (track && totalSlides > 0) {
        track.style.transform = `translateX(-${slideActual * 100}%)`;
    }
    actualizarIndicadores();
}

function siguienteSlide() {
    actualizarTotalSlides();
    if (totalSlides > 0) {
        slideActual = (slideActual + 1) % totalSlides;
        actualizarCarrusel();
    }
}

function anteriorSlide() {
    actualizarTotalSlides();
    if (totalSlides > 0) {
        slideActual = (slideActual - 1 + totalSlides) % totalSlides;
        actualizarCarrusel();
    }
}

function irASlide(indice) {
    slideActual = indice;
    actualizarCarrusel();
}

function actualizarIndicadores() {
    actualizarTotalSlides();
    const indicadoresContainer = document.getElementById('carrusel-indicadores');
    if (!indicadoresContainer) return;
    
    indicadoresContainer.innerHTML = '';
    
    const slides = document.querySelectorAll('.carrusel-slide');
    slides.forEach((_, indice) => {
        const indicador = document.createElement('div');
        indicador.className = 'indicador';
        if (indice === slideActual) {
            indicador.classList.add('activo');
        }
        indicador.addEventListener('click', () => irASlide(indice));
        indicadoresContainer.appendChild(indicador);
    });
}

// Funciones de efectos visuales
function crearConfeti() {
    const confetiContainer = document.getElementById('inicio');
    if (!confetiContainer) return;
    
    const colores = ['#ff6b6b', '#4834d4', '#00d2d3', '#ff9f43', '#10ac84', '#ee5a24', '#0abde3', '#ff9ff3'];
    
    for (let i = 0; i < 50; i++) {
        setTimeout(() => {
            const confeti = document.createElement('div');
            confeti.className = 'confeti';
            confeti.style.left = Math.random() * 100 + '%';
            confeti.style.backgroundColor = colores[Math.floor(Math.random() * colores.length)];
            confeti.style.width = Math.random() * 10 + 5 + 'px';
            confeti.style.height = Math.random() * 10 + 5 + 'px';
            confeti.style.animationDuration = Math.random() * 3 + 2 + 's';
            confeti.style.opacity = Math.random() * 0.8 + 0.2;
            
            confetiContainer.appendChild(confeti);
            
            setTimeout(() => {
                confeti.remove();
            }, 5000);
        }, i * 50);
    }
}

function iniciarConfeti() {
    crearConfeti();
    setInterval(crearConfeti, 8000);
}

// Funciones de música
function configurarMusica() {
    const audio = document.getElementById('musica-recuerdos');
    if (!audio) {
        console.error('No se encontró el elemento de audio');
        return;
    }
    
    audio.volume = 0.3;
    
    audio.addEventListener('error', function() {
        console.log('Error al cargar el archivo de audio');
    });
    
    audio.addEventListener('ended', function() {
        if (musicaReproduciendo) {
            audio.play();
        }
    });
}

function iniciarMusica() {
    const audio = document.getElementById('musica-recuerdos');
    const btnMusica = document.getElementById('btn-musica');
    const textoMusica = document.getElementById('texto-musica');
    
    if (!audio || !btnMusica || !textoMusica) return;
    
    const playPromise = audio.play();
    
    if (playPromise !== undefined) {
        playPromise.then(() => {
            musicaReproduciendo = true;
            btnMusica.classList.add('musica-activa');
            textoMusica.textContent = 'Música: ON';
            console.log('Música iniciada');
        }).catch(error => {
            console.log('No se pudo reproducir la música automáticamente:', error);
            musicaReproduciendo = false;
            btnMusica.classList.remove('musica-activa');
            textoMusica.textContent = 'Música: OFF';
        });
    }
}

function pausarMusica() {
    const audio = document.getElementById('musica-recuerdos');
    const btnMusica = document.getElementById('btn-musica');
    const textoMusica = document.getElementById('texto-musica');
    
    if (audio) {
        audio.pause();
    }
    musicaReproduciendo = false;
    if (btnMusica) {
        btnMusica.classList.remove('musica-activa');
    }
    if (textoMusica) {
        textoMusica.textContent = 'Música: OFF';
    }
    console.log('Música pausada');
}

function toggleMusica() {
    if (musicaReproduciendo) {
        pausarMusica();
    } else {
        iniciarMusica();
    }
}

// Funciones de modales
function cerrarModal() {
    const modales = document.querySelectorAll('.modal');
    modales.forEach(modal => {
        modal.style.display = 'none';
    });
    mensajeEditando = null;
    fotoEliminando = null;
}



// ... (mantener el resto del JavaScript igual hasta la función crearFuegosCorazon)

// Funciones de fuegos artificiales en forma de corazón mejorados
function iniciarFuegosCorazon() {
    detenerFuegosCorazon();
    console.log('Iniciando fuegos en forma de corazón');
    fuegosCorazonInterval = setInterval(crearFuegosCorazon, 600);
}

function detenerFuegosCorazon() {
    if (fuegosCorazonInterval) {
        clearInterval(fuegosCorazonInterval);
        fuegosCorazonInterval = null;
        console.log('Deteniendo fuegos en forma de corazón');
    }
}

function crearFuegosCorazon() {
    const container = document.getElementById('fuegos-corazon');
    if (!container) {
        console.error('No se encontró el contenedor de fuegos corazón');
        return;
    }
    
    const colores = ['#ff6b6b', '#ff3838', '#ff1744', '#d32f2f', '#f44336', '#ff69b4', '#ff1493', '#ffb6c1', '#ffc0cb', '#ffdab9'];
    
    // Crear múltiples corazones con diferentes tamaños y posiciones
    const numCorazones = Math.floor(Math.random() * 8) + 5; // Entre 5 y 12 corazones
    
    for (let i = 0; i < numCorazones; i++) {
        setTimeout(() => {
            // Posición aleatoria en la pantalla
            const x = Math.random() * window.innerWidth;
            const y = Math.random() * window.innerHeight;
            
            // Tamaño aleatorio para el corazón
            const tamaño = Math.random() * 15 + 8; // Entre 8 y 23px
            
            // Crear el corazón principal
            const corazon = document.createElement('div');
            corazon.className = 'fuego-corazon';
            corazon.style.left = x + 'px';
            corazon.style.top = y + 'px';
            corazon.style.width = tamaño + 'px';
            corazon.style.height = tamaño + 'px';
            corazon.style.color = colores[Math.floor(Math.random() * colores.length)];
            
            // Duración de la animación
            const duracion = Math.random() * 3 + 2; // Entre 2 y 5 segundos
            corazon.style.animationDuration = duracion + 's';
            
            container.appendChild(corazon);
            
            // Crear partículas alrededor del corazón
            crearParticulasCorazon(x, y, corazon.style.color);
            
            // Eliminar el corazón después de la animación
            setTimeout(() => {
                corazon.remove();
            }, duracion * 1000);
        }, i * 200); // Retraso entre corazones
    }
}








// ... (mantener el resto del JavaScript igual hasta la función crearFuegosCorazon)

// Funciones de fuegos artificiales en forma de corazón mejorados
function iniciarFuegosCorazon() {
    detenerFuegosCorazon();
    console.log('Iniciando fuegos en forma de corazón');
    fuegosCorazonInterval = setInterval(crearFuegosCorazon, 600);
}

function detenerFuegosCorazon() {
    if (fuegosCorazonInterval) {
        clearInterval(fuegosCorazonInterval);
        fuegosCorazonInterval = null;
        console.log('Deteniendo fuegos en forma de corazón');
    }
}

function crearFuegosCorazon() {
    const container = document.getElementById('fuegos-corazon');
    if (!container) {
        console.error('No se encontró el contenedor de fuegos corazón');
        return;
    }
    
    const colores = ['#ff6b6b', '#ff3838', '#ff1744', '#d32f2f', '#f44336', '#ff69b4', '#ff1493', '#ffb6c1', '#ffc0cb', '#ffdab9'];
    
    // Crear múltiples corazones con diferentes tamaños y posiciones
    const numCorazones = Math.floor(Math.random() * 8) + 5; // Entre 5 y 12 corazones
    
    for (let i = 0; i < numCorazones; i++) {
        setTimeout(() => {
            // Posición aleatoria en la pantalla
            const x = Math.random() * window.innerWidth;
            const y = Math.random() * window.innerHeight;
            
            // Tamaño aleatorio para el corazón
            const tamaño = Math.random() * 15 + 8; // Entre 8 y 23px
            
            // Crear el corazón principal
            const corazon = document.createElement('div');
            corazon.className = 'fuego-corazon';
            corazon.style.left = x + 'px';
            corazon.style.top = y + 'px';
            corazon.style.width = tamaño + 'px';
            corazon.style.height = tamaño + 'px';
            corazon.style.color = colores[Math.floor(Math.random() * colores.length)];
            
            // Duración de la animación
            const duracion = Math.random() * 3 + 2; // Entre 2 y 5 segundos
            corazon.style.animationDuration = duracion + 's';
            
            container.appendChild(corazon);
            
            // Crear partículas alrededor del corazón
            crearParticulasCorazon(x, y, corazon.style.color);
            
            // Eliminar el corazón después de la animación
            setTimeout(() => {
                corazon.remove();
            }, duracion * 1000);
        }, i * 200); // Retraso entre corazones
    }
}

function crearParticulasCorazon(x, y, color) {
    const container = document.getElementById('fuegos-corazon');
    if (!container) return;
    
    const numParticulas = Math.floor(Math.random() * 8) + 5; // Entre 5 y 12 partículas
    
    for (let i = 0; i < numParticulas; i++) {
        const particula = document.createElement('div');
        particula.className = 'fuego-corazon';
        particula.style.left = x + 'px';
        particula.style.top = y + 'px';
        particula.style.width = '6px';
        particula.style.height = '6px';
        particula.style.color = color;
        
        // Dirección aleatoria para la partícula
        const angulo = (Math.PI * 2 * i) / numParticulas;
        const distancia = Math.random() * 50 + 20; // Entre 20 y 70px
        
        const dx = Math.cos(angulo) * distancia;
        const dy = Math.sin(angulo) * distancia;
        
        // Animación de la partícula
        particula.style.animation = `corazon-particula ${Math.random() * 1 + 0.5}s ease-out forwards`;
        particula.style.setProperty('--dx', dx + 'px');
        particula.style.setProperty('--dy', dy + 'px');
        
        container.appendChild(particula);
        
        // Eliminar partícula después de la animación
        setTimeout(() => {
            particula.remove();
        }, (Math.random() * 1 + 0.5) * 1000);
    }
}

// ... (mantener el resto del JavaScript igual)







function crearParticulasCorazon(x, y, color) {
    const container = document.getElementById('fuegos-corazon');
    if (!container) return;
    
    const numParticulas = Math.floor(Math.random() * 8) + 5; // Entre 5 y 12 partículas
    
    for (let i = 0; i < numParticulas; i++) {
        const particula = document.createElement('div');
        particula.className = 'fuego-corazon';
        particula.style.left = x + 'px';
        particula.style.top = y + 'px';
        particula.style.width = '6px';
        particula.style.height = '6px';
        particula.style.color = color;
        
        // Dirección aleatoria para la partícula
        const angulo = (Math.PI * 2 * i) / numParticulas;
        const distancia = Math.random() * 50 + 20; // Entre 20 y 70px
        
        const dx = Math.cos(angulo) * distancia;
        const dy = Math.sin(angulo) * distancia;
        
        // Animación de la partícula
        particula.style.animation = `corazon-particula ${Math.random() * 1 + 0.5}s ease-out forwards`;
        particula.style.setProperty('--dx', dx + 'px');
        particula.style.setProperty('--dy', dy + 'px');
        
        container.appendChild(particula);
        
        // Eliminar partícula después de la animación
        setTimeout(() => {
            particula.remove();
        }, (Math.random() * 1 + 0.5) * 1000);
    }
}

// ... (mantener el resto del JavaScript igual)




// Cerrar modal al hacer clic fuera
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        cerrarModal();
    }
}

// Autoplay del carrusel
setInterval(siguienteSlide, 5000);





