import { courses, scenarios, modules, projects, faqs, resources } from "./data.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );
const icon = (name) => `<svg aria-hidden="true"><use href="assets/icons.svg#${escape(name)}"></use></svg>`;
const money = (value) => `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
const storageKey = "neuroshift.cart.v1";
const catalog = new Map(courses.map((course) => [course.id, course]));
const formatNames = {
  self: "Самостоятельно",
  feedback: "С обратной связью",
  team: "Для команды",
  consultation: "Помощь в выборе",
};
let category = "all";
let level = "all";
let activeScenario = scenarios[0];
let toastTimer;
let downloadUrl;
let requestCourses = [];

function restoreCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return new Set(Array.isArray(saved) ? saved.filter((id) => catalog.has(id)) : []);
  } catch {
    return new Set();
  }
}

const cart = restoreCart();

function notify(message) {
  const toast = $("#toast");
  clearTimeout(toastTimer);
  toast.innerHTML = `${icon("check")}<span>${escape(message)}</span>`;
  toast.hidden = false;
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 3600);
}

function saveCart() {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...cart]));
  } catch {
    notify("Корзина доступна в этой вкладке. Браузер запретил её сохранение.");
  }
}

function updateCartControls() {
  const count = $("#cart-count");
  count.textContent = cart.size;
  count.hidden = cart.size === 0;
  $("[data-open-cart]").setAttribute("aria-label", `Открыть корзину, курсов: ${cart.size}`);
  $$("[data-add]").forEach((button) => {
    const selected = cart.has(button.dataset.add);
    const course = catalog.get(button.dataset.add);
    button.classList.toggle("is-added", selected);
    button.setAttribute("aria-label", selected ? `Открыть корзину: ${course.title}` : `В корзину: ${course.title}`);
    button.title = selected ? "Курс в корзине. Открыть корзину" : "Добавить курс в корзину";
    const label = $("[data-add-label]", button);
    if (label) label.textContent = selected ? "Открыть корзину" : "Добавить в корзину";
    const svg = $("use", button);
    if (svg) svg.setAttribute("href", `assets/icons.svg#${selected ? "check" : "plus"}`);
  });
}

function renderCourses() {
  const filtered = courses.filter(
    (course) => (category === "all" || course.category === category) && (level === "all" || course.level === level),
  );
  $("#course-grid").innerHTML = filtered
    .map(
      (course) => `
    <article class="course-card accent-${escape(course.accent)}">
      <div class="course-visual"><img src="${escape(course.image)}" width="720" height="720" loading="lazy" alt="${escape(course.categoryLabel)}: пример визуальной концепции"><span class="course-badge">${escape(course.categoryLabel)}</span><span class="course-visual-icon">${icon(course.icon)}</span></div>
      <div class="course-body"><div class="course-meta"><span>${icon("clock")}${escape(course.duration)}</span><span>${icon("layers")}${course.lessons} занятий</span><span>${escape(course.levelLabel)}</span></div><h3>${escape(course.title)}</h3><p class="course-description">${escape(course.description)}</p>
      <div class="course-footer"><div class="course-price"><strong>${money(course.price)}</strong><span>Демо-стоимость</span></div><div class="course-actions"><button class="button button-outline-dark" type="button" data-course="${escape(course.id)}">О курсе${icon("arrow-up-right")}</button><button class="icon-button" type="button" data-add="${escape(course.id)}" aria-label="В корзину: ${escape(course.title)}" title="Добавить курс в корзину">${icon("plus")}</button></div></div></div>
    </article>`,
    )
    .join("");
  $("#catalog-empty").hidden = filtered.length > 0;
  $("#catalog-status").textContent = `Найдено курсов: ${filtered.length}`;
  updateCartControls();
}

function setCategory(value) {
  category = value;
  $$("[data-category]").forEach((button) => {
    const active = button.dataset.category === value;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderCourses();
}

const routes = {
  start: {
    category: "foundation",
    text: "Ваш маршрут: основы промптинга, небольшие задачи и первый самостоятельный проект.",
  },
  work: {
    category: "work",
    text: "Ваш маршрут: рабочие документы, структурирование информации и проверка результатов. Начните с повседневных задач.",
  },
  creative: {
    category: "creative",
    text: "Ваш маршрут: идеи, тексты и визуальные концепции. Выбирайте контент или изображения под задачи своего проекта.",
  },
  team: {
    category: "business",
    text: "Ваш маршрут: общий подход к ИИ, шаблоны команды и учебный пилот на одном процессе.",
  },
};

function selectRoute(value) {
  const route = routes[value];
  if (!route) return;
  $$("[data-route]").forEach((button) => {
    const active = button.dataset.route === value;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  $("#route-description").textContent = route.text;
  level = "all";
  $("#level-filter").value = "all";
  setCategory(route.category);
}

function renderScenario(id) {
  activeScenario = scenarios.find((scenario) => scenario.id === id) || scenarios[0];
  $("#scenario-tabs").innerHTML = scenarios
    .map(
      (scenario) =>
        `<button type="button" data-scenario="${escape(scenario.id)}" class="${scenario.id === activeScenario.id ? "is-active" : ""}" aria-pressed="${scenario.id === activeScenario.id}">${escape(scenario.label)}</button>`,
    )
    .join("");
  $("#basic-prompt").textContent = activeScenario.basic;
  $("#improved-prompt").textContent = activeScenario.improved;
  $("#basic-result").textContent = activeScenario.basicResult;
  $("#improved-result").textContent = activeScenario.improvedResult;
  $("#scenario-lesson").textContent = activeScenario.lesson;
}

function renderModules() {
  $("#module-list").innerHTML = modules
    .map(
      (module, index) =>
        `<details${index === 0 ? " open" : ""}><summary><span class="module-number">${String(index + 1).padStart(2, "0")}</span><span>${escape(module.title)}</span>${icon("plus")}</summary><div class="module-content"><p>${escape(module.description)}</p><p><strong>Практика:</strong> ${escape(module.task)}</p><p><strong>Навык:</strong> ${escape(module.skill)}</p></div></details>`,
    )
    .join("");
}

const documentExamples = {
  "content-plan":
    "НЕДЕЛЯ 01 / УЧЕБНЫЙ ПРОЕКТ\n\nПн / Разобрать вопрос аудитории\nСр / Показать процесс работы\nПт / Ответить на частые вопросы\n\nДля каждой публикации:\nцель → тезис → формат → проверка фактов\n\nКритерий: одна публикация решает одну задачу.",
  "analysis-note":
    "ЗАДАЧА: СРАВНИТЬ ДВА ПОДХОДА\n\n1. Зафиксировать критерии до сравнения.\n2. Выписать факты из исходных материалов.\n3. Отметить отсутствующие сведения.\n4. Сформулировать вывод с ограничениями.\n\nФакт ≠ предположение\nИсточник → наблюдение → вывод\n\nСледующий шаг: проверить открытые вопросы.",
  instruction:
    "ИНСТРУКЦИЯ / ПОДГОТОВКА МАТЕРИАЛА\n\nВход: согласованный бриф и источники.\n\n01. Проверить полноту исходных данных.\n02. Подготовить структуру документа.\n03. Составить черновик с помощью ИИ.\n04. Проверить факты и отредактировать.\n05. Передать материал на согласование.\n\nЕсли данных нет: запросить уточнение.\nРезультат: проверенный рабочий документ.",
  automation:
    "ПРОЦЕСС / ВХОДЯЩИЙ ЗАПРОС\n\nПолучение запроса\n        ↓\nПроверка исходных данных\n        ↓\nПодготовка черновика с ИИ\n        ↓\nПроверка ответственным человеком\n        ↓\nСогласование и сохранение\n\nИсключения: неполные данные → уточнение.\nОтветственность за результат: человек.",
};

function renderProjects() {
  $("#project-grid").innerHTML = projects
    .map((project, index) => {
      const visual =
        index < 4
          ? `<div class="project-cover"><img src="${escape(project.image)}" alt="${escape(project.title)}: учебная визуальная концепция" width="720" height="720" loading="lazy"><span class="project-open">${icon("arrow-up-right")}</span></div>`
          : `<div class="project-cover document-cover doc-${index}"><div class="document-top"><span>NEUROSHIFT / LAB</span><span>0${index + 1}</span></div><div class="document-title">${escape(project.title)}</div><div class="document-lines" aria-hidden="true"><span></span><span></span><span></span><span></span></div><div class="document-foot">${escape(project.category)}<br>Учебный образец</div><span class="project-open">${icon("arrow-up-right")}</span></div>`;
      return `<article class="project-item"><button class="project-button" type="button" data-project="${escape(project.id)}" aria-label="Посмотреть проект: ${escape(project.title)}">${visual}<div class="project-info"><span>${escape(project.category)}</span><h3>${escape(project.title)}</h3></div></button></article>`;
    })
    .join("");
}

function renderResources() {
  $("#resource-list").innerHTML = resources
    .map(
      (resource, index) =>
        `<article class="resource-row"><span class="resource-number">0${index + 1}</span><span class="resource-icon">${icon("file-text")}</span><div class="resource-info"><h3>${escape(resource.title)}</h3><p>${escape(resource.description)}</p></div><span class="resource-tag">${escape(resource.tag)} / MD</span><a href="${escape(resource.path)}" download aria-label="Скачать: ${escape(resource.title)}">Скачать${icon("download")}</a></article>`,
    )
    .join("");
}

function renderFaqs() {
  $("#faq-list").innerHTML = faqs
    .map(
      (faq) =>
        `<details><summary><span>${escape(faq.question)}</span>${icon("plus")}</summary><p>${escape(faq.answer)}</p></details>`,
    )
    .join("");
}

function syncModalScroll() {
  document.body.classList.toggle("has-modal", !!$("dialog[open]"));
}

function openModal(dialog) {
  if (!dialog.open) dialog.showModal();
  syncModalScroll();
}

function closeModal(dialog) {
  dialog.close();
  syncModalScroll();
}

function showCourse(id) {
  const course = catalog.get(id);
  if (!course) return;
  $("#detail-label").textContent = "ПРОГРАММА КУРСА";
  $("#detail-content").innerHTML =
    `<h2 id="detail-title">${escape(course.title)}</h2><div class="detail-meta"><span>${escape(course.levelLabel)}</span><span>${escape(course.duration)}</span><span>${course.lessons} занятий</span></div><p class="detail-description">${escape(course.description)}</p><h3>Что будете уметь</h3><ul class="detail-list">${course.outcomes.map((outcome) => `<li>${icon("check")}<span>${escape(outcome)}</span></li>`).join("")}</ul><h3>Содержание</h3><ol class="detail-modules">${course.syllabus.map((item) => `<li>${escape(item)}</li>`).join("")}</ol><div class="detail-bottom"><div><strong>${money(course.price)}</strong><span class="small-note">Демонстрационная стоимость</span></div><button class="button button-dark" type="button" data-add="${escape(course.id)}"><span data-add-label>Добавить в корзину</span>${icon("plus")}</button></div><p class="detail-note">Базовая комплектация: ${escape(course.format.toLowerCase())}. Срок доступа, обратная связь и окончательные условия согласовываются при оформлении.</p>`;
  updateCartControls();
  openModal($("#detail-dialog"));
}

function showProject(id) {
  const project = projects.find((item) => item.id === id);
  if (!project) return;
  $("#detail-label").textContent = "ПРИМЕР УЧЕБНОГО ПРОЕКТА";
  const visual = documentExamples[id]
    ? `<div class="project-detail-document"><pre>${escape(documentExamples[id])}</pre></div>`
    : `<img class="detail-image" src="${escape(project.image)}" alt="${escape(project.title)}" width="720" height="720">`;
  $("#detail-content").innerHTML =
    `${visual}<h2 id="detail-title">${escape(project.title)}</h2><p class="detail-description">${escape(project.description)}</p><h3>Задача</h3><p class="detail-description">${escape(project.task)}</p><h3>Навык</h3><p class="detail-description">${escape(project.skill)}</p><p class="detail-note">Это демонстрационный материал, созданный для сайта. Визуальные концепции подготовлены с помощью ИИ.</p>`;
  openModal($("#detail-dialog"));
}

function renderCart() {
  const selected = [...cart].map((id) => catalog.get(id));
  if (selected.length === 0) {
    $("#cart-items").innerHTML =
      `<div class="cart-empty">${icon("shopping-bag")}<h3>Здесь начинается ваш маршрут</h3><p>Добавьте курс, который хотите изучить.</p><button class="button button-dark" type="button" id="cart-to-catalog">Перейти к курсам${icon("arrow-right")}</button></div>`;
  } else {
    $("#cart-items").innerHTML = selected
      .map(
        (course) =>
          `<article class="cart-item"><img class="cart-item-image" src="${escape(course.image)}" alt="" width="64" height="64"><div class="cart-item-info"><h3>${escape(course.title)}</h3><p>${money(course.price)}</p></div><button class="icon-button cart-remove" type="button" data-remove="${escape(course.id)}" aria-label="Удалить из корзины: ${escape(course.title)}" title="Удалить курс">${icon("trash2")}</button></article>`,
      )
      .join("");
  }
  $("#cart-summary").hidden = selected.length === 0;
  $("#cart-total").textContent = money(selected.reduce((total, course) => total + course.price, 0));
}

function showCart() {
  $$("dialog[open]").forEach(closeModal);
  renderCart();
  openModal($("#cart-dialog"));
}

function addCourse(id) {
  if (!catalog.has(id)) return;
  if (cart.has(id)) {
    showCart();
    return;
  }
  cart.add(id);
  saveCart();
  updateCartControls();
  notify("Курс добавлен в корзину");
}

function clearRequestDownload() {
  $("#request-result").hidden = true;
  $("#request-download").removeAttribute("href");
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = undefined;
}

function showRequest(format = "consultation") {
  $$("dialog[open]").forEach(closeModal);
  requestCourses = [...cart].map((id) => catalog.get(id));
  clearRequestDownload();
  $("#request-form").reset();
  $("#request-form").elements.format.value = formatNames[format] ? format : "consultation";
  $("#request-title").textContent = format === "team" ? "Обучение для вашей команды." : "Соберём вашу заявку.";
  $("#request-selection").innerHTML = requestCourses.length
    ? `<strong>Выбранные курсы</strong><ul>${requestCourses.map((course) => `<li>${escape(course.shortTitle)} · ${money(course.price)}</li>`).join("")}</ul>`
    : "<strong>Индивидуальный подбор</strong><span>Укажите задачу ниже. Курсы можно добавить в каталоге.</span>";
  openModal($("#request-dialog"));
}

function generateRequest(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const fields = new FormData(form);
  const name = String(fields.get("name")).trim();
  if (name.length < 2) {
    form.elements.name.setCustomValidity("Укажите имя, минимум 2 символа.");
    form.elements.name.reportValidity();
    return;
  }
  clearRequestDownload();
  const total = requestCourses.reduce((sum, course) => sum + course.price, 0);
  const content = [
    "NEUROSHIFT / ЗАЯВКА НА ОБУЧЕНИЕ",
    `Дата подготовки: ${new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" }).format(new Date())}`,
    "",
    `Имя: ${name}`,
    `Email: ${String(fields.get("email")).trim()}`,
    `Формат: ${formatNames[fields.get("format")] || formatNames.consultation}`,
    "",
    "Выбранные курсы:",
    ...(requestCourses.length
      ? requestCourses.map((course) => `- ${course.title}: ${money(course.price)} (демонстрационная цена)`)
      : ["Подбор по задаче"]),
    ...(requestCourses.length ? [`Сумма демонстрационных цен: ${money(total)}`] : []),
    "",
    "Задача:",
    String(fields.get("goal")).trim() || "Нужно уточнить при обсуждении.",
    "",
    "Это подготовленный файл заявки. Он НЕ отправлен автоматически.",
    "Цены, сроки, состав программы и условия требуют согласования.",
    "Оплата на демонстрационном сайте не производится.",
  ].join("\n");
  downloadUrl = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/plain;charset=utf-8" }));
  $("#request-download").href = downloadUrl;
  $("#request-result").hidden = false;
  $("#request-result").scrollIntoView({
    block: "nearest",
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
}

function toggleMenu(open) {
  const button = $("#menu-toggle");
  $("#main-nav").classList.toggle("is-open", open);
  button.setAttribute("aria-expanded", String(open));
  button.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
  $("use", button).setAttribute("href", `assets/icons.svg#${open ? "x" : "menu"}`);
}

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(activeScenario.improved);
    notify("Промпт скопирован");
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents($("#improved-prompt"));
    selection.removeAllRanges();
    selection.addRange(range);
    notify("Не удалось скопировать автоматически. Текст промпта выделен.");
  }
}

function showPrivacy() {
  $("#detail-label").textContent = "ДАННЫЕ И КОНТАКТЫ";
  $("#detail-content").innerHTML =
    '<div class="privacy-copy"><h2 id="detail-title">Ваши данные остаются у вас.</h2><p>Витрина хранит в localStorage только идентификаторы курсов в корзине. Имя, адрес электронной почты и описание задачи используются в браузере для подготовки скачиваемого файла заявки.</p><p>Сайт не отправляет эти сведения на сервер и не использует внешние системы аналитики. Удалить сохранённую корзину можно через настройки данных сайта в браузере.</p><p>Это демонстрационный проект. Контакты организатора, реквизиты и условия покупки будут опубликованы до начала реального приёма заявок и оплаты.</p></div>';
  openModal($("#detail-dialog"));
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("button, a");
  if (!button) return;
  if (button.dataset.category) setCategory(button.dataset.category);
  if (button.dataset.route) selectRoute(button.dataset.route);
  if (button.id === "route-link") selectRoute($('[data-route][aria-pressed="true"]').dataset.route);
  if (button.dataset.scenario) {
    const id = button.dataset.scenario;
    renderScenario(id);
    $(`[data-scenario="${id}"]`).focus({ preventScroll: true });
  }
  if (button.dataset.course) showCourse(button.dataset.course);
  if (button.dataset.project) showProject(button.dataset.project);
  if (button.dataset.add) addCourse(button.dataset.add);
  if (button.hasAttribute("data-open-cart")) showCart();
  if (button.hasAttribute("data-close")) closeModal(button.closest("dialog"));
  if (button.dataset.request) showRequest(button.dataset.request);
  if (button.dataset.remove) {
    cart.delete(button.dataset.remove);
    saveCart();
    renderCart();
    updateCartControls();
    const next = $("[data-remove]", $("#cart-dialog")) || $("#cart-to-catalog");
    if (next) next.focus({ preventScroll: true });
  }
  if (button.id === "reset-filters") {
    level = "all";
    $("#level-filter").value = "all";
    setCategory("all");
    $('[data-category="all"]').focus({ preventScroll: true });
  }
  if (button.id === "cart-to-catalog") {
    closeModal($("#cart-dialog"));
    $("#courses").scrollIntoView();
    $('[data-category="all"]').focus({ preventScroll: true });
  }
  if (button.id === "cart-checkout") showRequest("self");
  if (button.id === "copy-prompt") copyPrompt();
  if (button.id === "privacy-button") showPrivacy();
  if (button.id === "menu-toggle") toggleMenu(button.getAttribute("aria-expanded") !== "true");
  if (button.closest("#main-nav") && button.tagName === "A") toggleMenu(false);
});

$("#level-filter").addEventListener("change", (event) => {
  level = event.target.value;
  renderCourses();
});
$("#request-form").addEventListener("submit", generateRequest);
$("#request-form").addEventListener("input", (event) => {
  if (event.target.name === "name") event.target.setCustomValidity("");
  clearRequestDownload();
});
$$("dialog").forEach((dialog) => {
  dialog.addEventListener("close", () => {
    syncModalScroll();
    if (dialog.id === "request-dialog") {
      clearRequestDownload();
      $("#request-form").reset();
    }
  });
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)
      closeModal(dialog);
  });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && $("#main-nav").classList.contains("is-open")) {
    toggleMenu(false);
    $("#menu-toggle").focus();
  }
});
window.matchMedia("(min-width: 1001px)").addEventListener("change", (event) => {
  if (event.matches) toggleMenu(false);
});
window.addEventListener("pagehide", (event) => {
  if (!event.persisted && downloadUrl) URL.revokeObjectURL(downloadUrl);
});

renderCourses();
renderScenario(scenarios[0].id);
renderModules();
renderProjects();
renderResources();
renderFaqs();
