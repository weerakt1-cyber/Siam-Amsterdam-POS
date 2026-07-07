// Translations for the customer-facing QR ordering flow (src/app/order/[tableNo]).
// Scoped to this one flow rather than a full i18n library — the only other
// customer-facing surface in this app is the POS itself, which staff run in
// whatever language they're comfortable with already.
//
// Deliberately does NOT translate menu item names/categories/variant labels —
// those are venue-entered content (menu.nameTh, categories.ts labels, etc.),
// not app chrome, and machine-translating someone's actual menu would be
// more likely to be wrong than helpful.

export type Lang = 'en' | 'ru' | 'zh'

export const LANGS: { code: Lang; flag: string; label: string }[] = [
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'ru', flag: '🇷🇺', label: 'Русский' },
  { code: 'zh', flag: '🇨🇳', label: '中文' },
]

export type OrderStringKey =
  | 'selectLanguage'
  | 'welcomeTitle' | 'welcomeSubtitle' | 'tableLabel' | 'yourName' | 'namePlaceholder'
  | 'errNameRequired' | 'errTableRequired' | 'continueToMenu'
  | 'orderMenu' | 'trackingBtn' | 'readyBtn' | 'loadingMenu' | 'noItemsCategory'
  | 'viewOrder' | 'yourOrder' | 'specialRequest' | 'notePlaceholder' | 'total'
  | 'placeOrder' | 'placingOrder' | 'staffWillBring' | 'each'
  | 'checkYourOrder' | 'makeSureCorrect' | 'noteLabel' | 'confirmOrder' | 'goBack'
  | 'basePriceLabel' | 'requiredTag' | 'selectAllRequired' | 'addToOrder'
  | 'orderStatus' | 'orderNum' | 'cancelled' | 'items'
  | 'orderReceived' | 'preparing' | 'ready' | 'delivered'
  | 'yourOrderReady' | 'staffBringShortly' | 'orderMore' | 'refreshing'
  | 'somethingWrong' | 'networkError'

export const STRINGS: Record<Lang, Record<OrderStringKey, string>> = {
  en: {
    selectLanguage:    'Select Language',
    welcomeTitle:       'Welcome! 👋',
    welcomeSubtitle:    'Please tell us your name before ordering',
    tableLabel:         'Table',
    yourName:           'Your Name',
    namePlaceholder:    'e.g. Somchai',
    errNameRequired:    'Please enter your name',
    errTableRequired:   'Please select a table',
    continueToMenu:     'Continue to Menu →',
    orderMenu:          'Order Menu',
    trackingBtn:        'Tracking',
    readyBtn:           'Ready!',
    loadingMenu:        'Loading menu...',
    noItemsCategory:    'No items in this category',
    viewOrder:          'View Order',
    yourOrder:          'Your Order',
    specialRequest:     'Special Request / Note',
    notePlaceholder:    'e.g. No ice, extra spicy, allergy info...',
    total:              'Total',
    placeOrder:         'Place Order →',
    placingOrder:       '⏳ Placing order...',
    staffWillBring:     'Staff will bring your order',
    each:               'each',
    checkYourOrder:     'Please Check Your Order',
    makeSureCorrect:    'Make sure everything below is correct before confirming',
    noteLabel:          'Note:',
    confirmOrder:       '✓ Yes, Confirm Order',
    goBack:             '← Go Back, Let Me Check',
    basePriceLabel:     'Base',
    requiredTag:        '*required',
    selectAllRequired:  'Please select all required options *',
    addToOrder:         'Add to Order →',
    orderStatus:        'Order Status',
    orderNum:           'Order',
    cancelled:          'Cancelled',
    items:              'Items',
    orderReceived:      'Order Received',
    preparing:          'Preparing',
    ready:              'Ready!',
    delivered:          'Delivered',
    yourOrderReady:     'Your order is ready!',
    staffBringShortly:  'Staff will bring it to you shortly.',
    orderMore:          '+ Order More',
    refreshing:         'Refreshing every 5 seconds',
    somethingWrong:     'Something went wrong',
    networkError:       'Network error — please try again',
  },
  ru: {
    selectLanguage:    'Выберите язык',
    welcomeTitle:       'Добро пожаловать! 👋',
    welcomeSubtitle:    'Пожалуйста, представьтесь перед заказом',
    tableLabel:         'Столик',
    yourName:           'Ваше имя',
    namePlaceholder:    'например, Иван',
    errNameRequired:    'Пожалуйста, введите ваше имя',
    errTableRequired:   'Пожалуйста, выберите столик',
    continueToMenu:     'Перейти к меню →',
    orderMenu:          'Меню заказа',
    trackingBtn:        'Статус',
    readyBtn:           'Готово!',
    loadingMenu:        'Загрузка меню...',
    noItemsCategory:    'Нет позиций в этой категории',
    viewOrder:          'Мой заказ',
    yourOrder:          'Ваш заказ',
    specialRequest:     'Особые пожелания / Заметка',
    notePlaceholder:    'например, без льда, поострее, аллергии...',
    total:              'Итого',
    placeOrder:         'Оформить заказ →',
    placingOrder:       '⏳ Оформляем заказ...',
    staffWillBring:     'Персонал принесёт ваш заказ',
    each:               'за шт.',
    checkYourOrder:     'Проверьте ваш заказ',
    makeSureCorrect:    'Убедитесь, что всё указано верно, перед подтверждением',
    noteLabel:          'Заметка:',
    confirmOrder:       '✓ Да, подтвердить заказ',
    goBack:             '← Назад, я проверю',
    basePriceLabel:     'Базовая цена',
    requiredTag:        '*обязательно',
    selectAllRequired:  'Пожалуйста, выберите все обязательные опции *',
    addToOrder:         'Добавить в заказ →',
    orderStatus:        'Статус заказа',
    orderNum:           'Заказ',
    cancelled:          'Отменён',
    items:              'Позиции',
    orderReceived:      'Заказ принят',
    preparing:          'Готовится',
    ready:              'Готово!',
    delivered:          'Подано',
    yourOrderReady:     'Ваш заказ готов!',
    staffBringShortly:  'Персонал скоро принесёт его вам.',
    orderMore:          '+ Заказать ещё',
    refreshing:         'Обновление каждые 5 секунд',
    somethingWrong:     'Что-то пошло не так',
    networkError:       'Ошибка сети — попробуйте снова',
  },
  zh: {
    selectLanguage:    '选择语言',
    welcomeTitle:       '欢迎！👋',
    welcomeSubtitle:    '下单前请告诉我们您的姓名',
    tableLabel:         '桌号',
    yourName:           '您的姓名',
    namePlaceholder:    '例如：小明',
    errNameRequired:    '请输入您的姓名',
    errTableRequired:   '请选择桌号',
    continueToMenu:     '进入菜单 →',
    orderMenu:          '点餐菜单',
    trackingBtn:        '查看进度',
    readyBtn:           '已完成！',
    loadingMenu:        '菜单加载中...',
    noItemsCategory:    '该分类暂无商品',
    viewOrder:          '查看订单',
    yourOrder:          '您的订单',
    specialRequest:     '特殊要求 / 备注',
    notePlaceholder:    '例如：不加冰、加辣、过敏信息...',
    total:              '总计',
    placeOrder:         '下单 →',
    placingOrder:       '⏳ 正在下单...',
    staffWillBring:     '服务员会将餐点送到您的桌上',
    each:               '/份',
    checkYourOrder:     '请核对您的订单',
    makeSureCorrect:    '确认以下内容无误后再提交',
    noteLabel:          '备注：',
    confirmOrder:       '✓ 确认下单',
    goBack:             '← 返回检查',
    basePriceLabel:     '基础价',
    requiredTag:        '*必选',
    selectAllRequired:  '请选择所有必选项 *',
    addToOrder:         '加入订单 →',
    orderStatus:        '订单状态',
    orderNum:           '订单',
    cancelled:          '已取消',
    items:              '商品',
    orderReceived:      '订单已收到',
    preparing:          '制作中',
    ready:              '已完成！',
    delivered:          '已送达',
    yourOrderReady:     '您的订单已完成！',
    staffBringShortly:  '服务员马上为您送上。',
    orderMore:          '+ 继续点餐',
    refreshing:         '每 5 秒自动刷新',
    somethingWrong:     '出错了',
    networkError:       '网络错误，请重试',
  },
}

const LS_KEY = 'pos_order_lang'

export function loadOrderLang(): Lang {
  if (typeof window === 'undefined') return 'en'
  try {
    const saved = localStorage.getItem(LS_KEY)
    if (saved === 'en' || saved === 'ru' || saved === 'zh') return saved
  } catch { /* ignore */ }
  return 'en'
}

export function saveOrderLang(lang: Lang): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(LS_KEY, lang) } catch { /* ignore */ }
}
