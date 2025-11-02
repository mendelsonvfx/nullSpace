# RayHub Design System

Дизайн-гайд проекта RayHub. Документация содержит все используемые цвета, отступы, закругления и другие параметры дизайн-системы.

---

## Цветовая палитра

> Основано на дизайн-системе **nullSpace** — тёмная цветовая схема с акцентом на фиолетовый градиент.

### Фоновые цвета (Background Hierarchy)
| Название | Hex код | RGB | Применение | Пример из референса |
|----------|---------|-----|------------|---------------------|
| `app-bg` | `#0a0a0a` | `rgb(10, 10, 10)` | Основной фон приложения | Main content area |
| `sidebar-bg` | `#0f0f0f` | `rgb(15, 15, 15)` | Фон сайдбара и правой панели | Left sidebar, right panel |
| `card-bg` | `#141414` | `rgb(20, 20, 20)` | Фон карточек и элементов | Project cards, action cards, version cards |
| `hover-bg` | `#1a1a1a` | `rgb(26, 26, 26)` | Фон при наведении | Hover state для карточек и кнопок |

**Примечание:** Все фоновые цвета построены на оттенках серого с шагом ~5 единиц, создавая тонкую визуальную иерархию.

### Границы (Borders)
| Название | Hex код | RGB | Применение | Визуальный вес |
|----------|---------|-----|------------|----------------|
| `border-primary` | `#1a1a1a` | `rgb(26, 26, 26)` | Основные границы элементов | Минимальный контраст |
| `border-secondary` | `#262626` | `rgb(38, 38, 38)` | Вторичные границы, разделители | Средний контраст |
| `border-hover` | `#3f3f46` | `rgb(63, 63, 70)` | Границы при наведении и фокусе | Высокий контраст |

**Дополнительные цвета границ:**
- `#262626` - для неактивных фильтров и кнопок
- Акцентные границы используют opacity: `rgba(139, 92, 246, 0.3)` для тонкого фиолетового свечения

### Текст (Text Colors)
| Название | Hex код | RGB | Применение | Контрастность |
|----------|---------|-----|------------|----------------|
| `text-primary` | `#e4e4e7` | `rgb(228, 228, 231)` | Основной текст, заголовки | Высокая (AAA) |
| `text-secondary` | `#a1a1aa` | `rgb(161, 161, 170)` | Вторичный текст, метаданные | Средняя (AA) |
| `text-muted` | `#71717a` | `rgb(113, 113, 122)` | Приглушенный текст, подсказки | Низкая |
| `text-dim` | `#52525b` | `rgb(82, 82, 91)` | Очень приглушенный текст, плейсхолдеры | Минимальная |

### Акцентные цвета (Accent)
| Название | Значение | Применение | Используется в |
|----------|----------|------------|----------------|
| `accent` | `var(--accent-color)` | Динамический акцентный цвет | Кнопки, активные состояния |
| `accent-hover` | `var(--accent-color-hover)` | Акцент при наведении | Hover состояния |
| `accent-default` | `#8b5cf6` | Фиолетовый по умолчанию | Градиент `linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)` |
| `accent-default-hover` | `#7c3aed` | Темнее на 1 тон | - |

**Градиент кнопки "New Project":**
```css
background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
```

### Статусы (Status Colors)
| Название | Hex код | Светлая версия | Применение |
|----------|---------|----------------|------------|
| `status-active` | `#10b981` | `#34d399` | Зелёный - активные проекты, оплаченные |
| `status-paused` | `#f59e0b` | `#fbbf24` | Янтарный - приостановленные проекты |
| `status-completed` | `#3b82f6` | `#60a5fa` | Синий - завершённые проекты |
| `status-archived` | `#71717a` | `#a1a1aa` | Серый - архивные проекты |

**Использование с opacity для фонов:**
- Badge фон: `rgba(16, 185, 129, 0.15)` - 15% opacity
- Badge граница: `rgba(16, 185, 129, 0.3)` - 30% opacity
- Свечение: `box-shadow: 0 0 8px rgba(16, 185, 129, 0.5)` - 50% opacity

### Софт (Software Colors)
Используются для градиентов в карточках запуска софта и badges:

| Софт | Основной цвет | Светлая версия | Градиент начало |
|------|---------------|----------------|-----------------|
| Blender | `#f97316` | `#fb923c` | `rgba(249, 115, 22, 0.2)` |
| After Effects | `#9333ea` | `#c084fc` | `rgba(147, 51, 234, 0.2)` |
| Houdini | `#ff4713` | - | - |
| Maya | `#0faded` | - | - |
| Cinema 4D | `#0099d8` | - | - |
| Substance | `#f37a3a` | - | - |
| Unreal | `#313131` | - | - |
| Unity | `#000000` | - | - |
| ZBrush | `#f37021` | - | - |
| Photoshop | `#31a8ff` | - | - |
| Marmoset | `#ff6b00` | - | - |

**Примеры использования софта:**
```css
/* Blender icon */
background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);

/* After Effects icon */
background: linear-gradient(135deg, #9333ea 0%, #7c3aed 100%);

/* Badge фон */
background: rgba(249, 115, 22, 0.15); /* Blender */
background: rgba(147, 51, 234, 0.15); /* After Effects */
```

### Дополнительные цвета
| Название | Hex код | Применение |
|----------|---------|------------|
| `zinc-950` | `#09090b` | Самый тёмный фон |
| `zinc-900` | `#18181b` | Используется в некоторых контейнерах |
| `zinc-800` | `#27272a` | Фоны модальных окон, выпадающих меню |
| `zinc-700` | `#3f3f46` | Активные состояния фильтров |

### Специальные цвета

**Предупреждения и дедлайны:**
- Красный: `#ef4444` (для дедлайнов)
- Фон красного badge: `rgba(239, 68, 68, 0.15)`
- Текст: `#f87171`

**Клиенты:**
- Синий: `#3b82f6`
- Фон: `rgba(59, 130, 246, 0.15)`
- Текст: `#60a5fa`

---

## Закругления (Border Radius)

Система закруглений основана на семантическом именовании в зависимости от использования:

| Название | Размер | Применение | Примеры элементов |
|----------|--------|------------|-------------------|
| `rounded-badge` | `6px` | Мелкие элементы | Badges, теги, статусы |
| `rounded-button` | `8px` | Интерактивные элементы | Кнопки, поля ввода, фильтры |
| `rounded-med` | `10px` | Средние элементы | Quick Actions, контейнеры Overview |
| `rounded-card` | `12px` | Большие карточки | Карточки проектов |
| `rounded-software` | `14px` | Карточки софта | Кнопки запуска софта |
| `rounded-modal` | `16px` | Модальные окна | Диалоги, всплывающие окна |

---

## Размеры шрифтов (Font Sizes)

| Название | Размер | Применение |
|----------|--------|------------|
| `text-project-title` | `28px` | Заголовок проекта |
| `text-section-title` | `14px` | Заголовки секций |
| `text-card-title` | `15px` | Заголовки карточек |
| `text-badge` | `11px` | Текст в badges |

---

## Тени (Box Shadow)

### Свечение (Glow Effects)
| Название | Значение | Применение |
|----------|----------|------------|
| `shadow-glow-green` | `0 0 8px rgba(16, 185, 129, 0.5)` | Активные элементы |
| `shadow-glow-yellow` | `0 0 8px rgba(245, 158, 11, 0.5)` | Предупреждения |
| `shadow-glow-blue` | `0 0 8px rgba(59, 130, 246, 0.5)` | Информация |
| `shadow-glow-accent` | `0 0 8px rgba(139, 92, 246, 0.5)` | Акцентные элементы |
| `shadow-card-hover` | `0 4px 12px rgba(0, 0, 0, 0.3)` | Карточки при наведении |

---

## Анимации (Animations)

### Ключевые кадры (Keyframes)

#### pulse-glow (зеленый)
Пульсирующее свечение для активных элементов.
- `0%, 100%`: `box-shadow: 0 0 8px rgba(34, 197, 94, 1)`
- `50%`: `box-shadow: 0 0 13px rgba(34, 197, 94, 1)`
- Длительность: `2s ease-in-out infinite`

#### pulse-glow-yellow
Пульсирующее свечение для предупреждений.
- `0%, 100%`: `box-shadow: 0 0 8px rgba(234, 179, 8, 1)`
- `50%`: `box-shadow: 0 0 13px rgba(234, 179, 8, 1)`
- Длительность: `2s ease-in-out infinite`

#### pulse-glow-blue
Пульсирующее свечение для информации.
- `0%, 100%`: `box-shadow: 0 0 8px rgba(59, 130, 246, 1)`
- `50%`: `box-shadow: 0 0 13px rgba(59, 130, 246, 1)`
- Длительность: `2s ease-in-out infinite`

#### slide-in-right
Появление элемента справа.
- `0%`: `transform: translateX(20px); opacity: 0`
- `100%`: `transform: translateX(0); opacity: 1`
- Длительность: `0.3s ease-out`

#### checkmark-pop
Появление галочки с эффектом "pop".
- `0%`: `transform: scale(0); opacity: 0`
- `50%`: `transform: scale(1.2)`
- `100%`: `transform: scale(1); opacity: 1`
- Длительность: `0.3s ease-out`

#### shot-complete-glow
Свечение при завершении шота.
- `0%, 100%`: `box-shadow: 0 0 0 rgba(16, 185, 129, 0)`
- `50%`: `box-shadow: 0 0 12px rgba(16, 185, 129, 0.6)`
- Длительность: `0.6s ease-out`

---

## Отступы (Spacing)

### Стандартные отступы Tailwind
Проект использует стандартную систему отступов Tailwind CSS:

| Класс | Размер | px |
|-------|--------|-----|
| `p-0.5` / `m-0.5` | `0.125rem` | 2px |
| `p-1` / `m-1` | `0.25rem` | 4px |
| `p-1.5` / `m-1.5` | `0.375rem` | 6px |
| `p-2` / `m-2` | `0.5rem` | 8px |
| `p-2.5` / `m-2.5` | `0.625rem` | 10px |
| `p-3` / `m-3` | `0.75rem` | 12px |
| `p-3.5` / `m-3.5` | `0.875rem` | 14px |
| `p-4` / `m-4` | `1rem` | 16px |
| `p-5` / `m-5` | `1.25rem` | 20px |
| `p-6` / `m-6` | `1.5rem` | 24px |
| `p-7` / `m-7` | `1.75rem` | 28px |
| `p-8` / `m-8` | `2rem` | 32px |

### Часто используемые отступы в проекте

#### Контейнеры
- Горизонтальные отступы контента: `px-7` (28px)
- Вертикальные отступы контента: `py-6` - `py-7` (24-28px)
- Отступ между секциями: `mb-6` - `mb-7` (24-28px)

#### Карточки и элементы
- Внутренние отступы карточек: `p-4` (16px)
- Отступы между элементами в grid: `gap-2` - `gap-3` (8-12px)
- Отступы в кнопках: `px-3 py-2` или `px-4 py-2` (12-16px / 8px)

#### Заголовки
- Отступ под заголовками секций: `mb-3` - `mb-3.5` (12-14px)
- Отступ под заголовком страницы: `mb-6` (24px)

---

## Компоненты

### Кнопки

#### Quick Action Button
```tsx
className="group p-3 bg-card-bg border border-border-primary hover:bg-hover-bg hover:border-accent/30 rounded-med flex items-center gap-2.5 transition-all hover:-translate-y-0.5 cursor-pointer"
```

#### Software Launcher Button
```tsx
className="p-4 border border-zinc-800 rounded-xl flex items-center gap-3 transition-all duration-200 group"
```

#### Filter Button (Active)
```tsx
className="flex-1 px-3 py-2 rounded-button text-[13px] transition-all font-normal flex items-center justify-center gap-1.5 border bg-hover-bg border-border-hover text-text-primary"
```

#### Filter Button (Inactive)
```tsx
className="flex-1 px-3 py-2 rounded-button text-[13px] transition-all font-normal flex items-center justify-center gap-1.5 border bg-transparent border-border-secondary text-text-muted hover:border-border-hover"
```

### Контейнеры

#### Overview Container
```tsx
className="bg-zinc-900 border border-zinc-800 rounded-med p-4"
```

#### Modal
```tsx
className="bg-zinc-900 rounded-modal border border-zinc-800 shadow-2xl w-full max-w-md"
```

#### Input Field
```tsx
className="w-full bg-zinc-800 border border-zinc-700 rounded-button px-3 py-2 text-sm focus:outline-none focus:border-accent"
```

### Badges

#### Status Badge
```tsx
className="px-2.5 py-1 rounded-badge text-xs font-medium bg-status-active/15 text-status-active border border-status-active/30"
```

#### Tag
```tsx
className="px-2.5 py-1 bg-hover-bg rounded-badge text-xs text-text-muted border border-transparent"
```

---

## Переходы (Transitions)

### Стандартные переходы
- Базовый: `transition-all` или `transition-colors`
- Длительность: `duration-200` (200ms) для большинства элементов
- Easing: По умолчанию используется `ease` от Tailwind

### Специальные переходы
- Hover эффект для карточек: `hover:-translate-y-0.5` с `transition-all`
- Модальные окна: `transition-opacity duration-200`
- Кнопки с прожатием: `transform: scale(0.98)` при mouseDown

---

## Grid системы

### Project List Grid
```tsx
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
```

### Quick Actions Grid
```tsx
className="grid grid-cols-3 gap-3"
```

### Software Launchers Grid
```tsx
className="grid grid-cols-2 gap-2"
```

---

## Градиенты

### Софт карточки
Карточки запуска софта используют радиальные градиенты с цветом софта:
```tsx
background: `radial-gradient(circle at 00% 120%, ${softwareColor}15 0%, transparent 80%), rgb(24, 24, 27)`
```

### Акцентные кнопки
```tsx
className="bg-gradient-to-br from-accent to-accent-hover"
```

### Header Gradient Fade
Плавный переход от фона header к прозрачному:
```tsx
background: 'linear-gradient(to bottom, #0a0a0a 0%, rgba(10, 10, 10, 0.9) 20%, rgba(10, 10, 10, 0.7) 40%, rgba(10, 10, 10, 0.4) 60%, rgba(10, 10, 10, 0.15) 80%, transparent 100%)'
```

---

## Лучшие практики

### Цвета
1. Всегда используйте семантические названия из палитры (`bg-card-bg` вместо `bg-zinc-900`)
2. Для акцентных элементов используйте `accent` переменные для поддержки кастомизации
3. Соблюдайте иерархию фонов: `app-bg` → `sidebar-bg` → `card-bg` → `hover-bg`

### Закругления
1. Используйте семантические названия: `rounded-badge`, `rounded-button`, `rounded-med`, `rounded-card`, `rounded-modal`
2. Не используйте произвольные значения `rounded-[Npx]` - добавьте их в систему
3. Большие элементы = большее закругление

### Отступы
1. Используйте стандартные значения Tailwind
2. Для согласованности придерживайтесь сетки 4px (0.25rem)
3. Сохраняйте визуальную иерархию через отступы

### Анимации
1. Используйте `transition-all` для универсальных переходов
2. Для производительности предпочитайте `transition-colors` или `transition-transform`
3. Стандартная длительность: 200ms

---

**Версия:** 1.0
**Последнее обновление:** 2025-01-02
