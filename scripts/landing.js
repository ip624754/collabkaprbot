const revealEls = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.14 }
);
revealEls.forEach((el) => observer.observe(el));

for (const card of document.querySelectorAll('.accordion-card')) {
  const button = card.querySelector('.accordion-toggle');
  button?.addEventListener('click', () => {
    const isOpen = card.classList.contains('open');
    card.classList.toggle('open', !isOpen);
    button.setAttribute('aria-expanded', String(!isOpen));
  });
}

const SURFACE_CONTENT = {
  home: {
    kicker: 'Живой экран',
    title: 'Домашняя',
    subtitle: 'Первый экран объясняет роль и даёт быстрый вход в основные разделы без лишнего шума.',
    image: '/assets/screenshots/home-live-shot.png',
    imageAlt: 'Домашняя Collabka PR с быстрым стартом и основными разделами',
    visible: [
      'первые 60 секунд без перегруза',
      'текущий режим пользователя и быстрый старт',
      'основные разделы уже на одном экране',
      'понятный вход без длинного route-map текста',
    ],
    why: 'Пользователь с первого экрана понимает, куда он попал, что делать дальше и где основные точки входа.',
    next: 'Выбрать роль, открыть нужный раздел и перейти к каталогу, заявкам или своей рабочей поверхности.',
  },
  catalog: {
    kicker: 'Живой экран',
    title: 'Каталог брендов',
    subtitle: 'Даже пустой результат объясняет контекст и не оставляет пользователя в тупике.',
    image: '/assets/screenshots/catalog-live-shot.png',
    imageAlt: 'Каталог брендов в Collabka PR с понятным нулевым результатом',
    visible: [
      'активный режим и текущий каталог',
      'краткая сводка по фильтрам',
      'нулевой результат сформулирован человечески',
      'рядом есть понятный следующий шаг',
    ],
    why: 'Пользователь не остаётся один на один с нулевым результатом, а сразу понимает, что можно ослабить фильтры или сбросить параметры.',
    next: 'Открыть фильтры, убрать 1–2 ограничения и снова посмотреть список брендов.',
  },
  filters: {
    kicker: 'Живой экран',
    title: 'Фильтры брендов',
    subtitle: 'Параметры читаются быстро, а действия стоят там, где их ожидаешь увидеть.',
    image: '/assets/screenshots/filters-live-shot.png',
    imageAlt: 'Фильтры брендов в Collabka PR',
    visible: [
      'режим и каталог указаны отдельно',
      'параметры разложены по строкам',
      'состояние читается без простыни',
      'действия вынесены вниз: Сбросить, Показать бренды, Назад, Меню, Home',
    ],
    why: 'Экран ощущается рабочим: сначала видно состояние, потом действия, и пользователь не теряет контекст.',
    next: 'Изменить 1–2 параметра и открыть список брендов уже с нужным набором фильтров.',
  },
  deal: {
    kicker: 'Живой flow',
    title: 'Диалог и стадия сделки',
    subtitle: 'Заявка, история, статус и действия живут в одном рабочем контуре.',
    image: '/assets/screenshots/deal-live-shot.png',
    imageAlt: 'Рабочая карточка заявки и стадия сделки в Collabka PR',
    visible: [
      'рабочая карточка заявки',
      'текущий статус и этап сделки',
      'последние сообщения и важные действия',
      'следующий шаг доступен прямо на месте',
    ],
    why: 'Не нужно прыгать между разными чатами и списками, чтобы понять, что происходит и что делать дальше.',
    next: 'Открыть диалог, ответить второй стороне или перевести сделку на следующий этап.',
  },
};

const modalRoot = document.getElementById('surface-modal');
const modalImage = document.getElementById('surface-modal-image');
const modalKicker = document.getElementById('surface-modal-kicker');
const modalTitle = document.getElementById('surface-modal-title');
const modalSubtitle = document.getElementById('surface-modal-subtitle');
const modalVisible = document.getElementById('surface-modal-visible');
const modalWhy = document.getElementById('surface-modal-why');
const modalNext = document.getElementById('surface-modal-next');
const modalClosers = document.querySelectorAll('[data-modal-close]');
let activeSurfaceTrigger = null;
const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function populateModal(surfaceKey) {
  const data = SURFACE_CONTENT[surfaceKey];
  if (!data) return;
  modalKicker.textContent = data.kicker;
  modalTitle.textContent = data.title;
  modalSubtitle.textContent = data.subtitle;
  modalImage.src = data.image;
  modalImage.alt = data.imageAlt;
  modalVisible.innerHTML = '';
  for (const item of data.visible) {
    const li = document.createElement('li');
    li.textContent = item;
    modalVisible.appendChild(li);
  }
  modalWhy.textContent = data.why;
  modalNext.textContent = data.next;
}

function openSurfaceModal(trigger) {
  const key = trigger?.dataset?.surface;
  if (!key || !modalRoot) return;
  populateModal(key);
  activeSurfaceTrigger = trigger;
  modalRoot.classList.add('is-open');
  modalRoot.setAttribute('aria-hidden', 'false');
  document.body.classList.add('body-modal-open');
  const closeBtn = modalRoot.querySelector('.surface-modal-close');
  closeBtn?.focus();
}

function closeSurfaceModal() {
  if (!modalRoot) return;
  modalRoot.classList.remove('is-open');
  modalRoot.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('body-modal-open');
  modalImage.removeAttribute('src');
  if (activeSurfaceTrigger) activeSurfaceTrigger.focus();
}

for (const card of document.querySelectorAll('.screen-card-gallery')) {
  card.addEventListener('click', () => openSurfaceModal(card));
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openSurfaceModal(card);
    }
  });
}

for (const closer of modalClosers) {
  closer.addEventListener('click', closeSurfaceModal);
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && modalRoot?.classList.contains('is-open')) {
    closeSurfaceModal();
  }
});


function trapModalFocus(event) {
  if (event.key !== 'Tab' || !modalRoot?.classList.contains('is-open')) return;
  const focusable = Array.from(modalRoot.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

document.addEventListener('keydown', trapModalFocus);
