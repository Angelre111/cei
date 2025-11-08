// Funcionalidad del Menú Móvil
        const menuToggle = document.getElementById('menu-toggle');
        const mobileMenu = document.getElementById('mobile-menu');
        const menuIconOpen = document.getElementById('menu-icon-open');
        const menuIconClose = document.getElementById('menu-icon-close');

        // Función para alternar el menú
        menuToggle.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
            menuIconOpen.classList.toggle('hidden');
            menuIconClose.classList.toggle('hidden');
        });

        // Ocultar el menú móvil al hacer clic en un enlace
        mobileMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                if (!mobileMenu.classList.contains('hidden')) {
                    mobileMenu.classList.add('hidden');
                    menuIconOpen.classList.remove('hidden');
                    menuIconClose.classList.add('hidden');
                }
            });
        });

        // Funcionalidad del Carrusel
        const carousel = document.getElementById('carousel');
        const items = carousel.querySelectorAll('.carousel-item');
        const indicatorsContainer = document.getElementById('carousel-indicators');
        let currentIndex = 0;
        const intervalTime = 5000; // 5 segundos

        // 1. Crear indicadores
        items.forEach((_, index) => {
            const indicator = document.createElement('button');
            indicator.classList.add('w-3', 'h-3', 'rounded-full', 'bg-white', 'opacity-50', 'hover:opacity-100', 'transition', 'duration-300');
            if (index === 0) {
                indicator.classList.add('opacity-100');
            }
            indicator.setAttribute('data-slide-to', index);
            indicator.addEventListener('click', () => goToSlide(index));
            indicatorsContainer.appendChild(indicator);
        });
        const indicators = indicatorsContainer.querySelectorAll('button');

        // Función para mostrar un slide específico
        function goToSlide(index) {
            // Limpiar clases activas
            items.forEach(item => item.classList.remove('active'));
            indicators.forEach(indicator => indicator.classList.remove('opacity-100'));
            indicators.forEach(indicator => indicator.classList.add('opacity-50'));

            // Establecer nuevo slide activo
            items[index].classList.add('active');
            indicators[index].classList.remove('opacity-50');
            indicators[index].classList.add('opacity-100');

            currentIndex = index;
        }

        // Función para avanzar al siguiente slide
        function nextSlide() {
            currentIndex = (currentIndex + 1) % items.length;
            goToSlide(currentIndex);
        }

        // Iniciar la reproducción automática
        let carouselInterval = setInterval(nextSlide, intervalTime);

        // Opcional: Pausar al pasar el ratón (útil en desktop)
        carousel.addEventListener('mouseenter', () => clearInterval(carouselInterval));
        carousel.addEventListener('mouseleave', () => carouselInterval = setInterval(nextSlide, intervalTime));

        // Inicializar la funcionalidad del carrusel en el primer slide
        window.onload = () => {
             // Asegurarse de que el primer slide e indicador estén activos al cargar
             goToSlide(0);
        };