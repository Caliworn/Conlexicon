let state = {
  activeDictionaryId: "",
  selectedEntryId: "",
  selectedDictionaryConfigId: "",
  activeView: "editor",
  uiLanguage: "zh",
  uiTheme: "light",
  dictionaries: [],
};

let backendAvailable = true;
let backendMessage = "";
let searchQuery = "";
const ENTRY_SEARCH_DEBOUNCE_MS = 250;
const ENTRY_QUERY_WINDOW_PAGE_SIZE = 200;
const ROOT_GROUP_QUERY_WINDOW_PAGE_SIZE = 100;
const QUERY_WINDOW_MAX_LOADED_PAGES = 5;
let entrySearchDebounceTimer = 0;
let activePart = "";
let entrySort = "lemmaAsc";
let toastTimer = null;
let editorMode = "display";
let currentTheme = "light";
let currentLanguage = "zh";
let loadedDictionaryIds = new Set();
const UI_PREFERENCES_STORAGE_KEY = "conlexicon:ui-preferences";
const shellState = {
  navCollapsed: false,
  wideNavCollapsed: false,
  navDrawerOpen: false,
  browserCollapsedByView: {},
  browserDrawerOpen: false,
};
let activeAppTooltipTarget = null;
const desktopNavMediaQuery = window.matchMedia("(min-width: 800px)");
const wideNavMediaQuery = window.matchMedia("(min-width: 1280px)");
const analysisModel = window.ConlexiconAnalysis;
const entryRelationsModel = window.ConlexiconEntryRelations;
const dictionaryQueryModel = window.ConlexiconDictionaryQuery;
const ipaModel = window.ConlexiconIpa;
const IPA_STRESS_MARKER = ipaModel.IPA_STRESS_MARKER;
const GLOSS_STYLE_KEYS = ["gla", "glb", "glc", "ft"];
const DEFAULT_ENTRY_EXAMPLE_RENDER_PATTERN = "(\\gla)\n(\\glb)\n(\\glc)\n(\\ft)";
const DEFAULT_ENTRY_LIST_TAG_DISPLAY_LIMIT = 3;
const MIN_ENTRY_LIST_TAG_DISPLAY_LIMIT = 2;
const MAX_ENTRY_LIST_TAG_DISPLAY_LIMIT = 10;
const NO_PART_FILTER_VALUE = "__conlexicon_no_part__";
const tagModel = window.ConlexiconTags;
const morphologyModel = window.ConlexiconMorphology;
const entrySearchModel = window.ConlexiconEntrySearch;
const searchNormalizationModel = window.ConlexiconSearchNormalization;
const ENTRY_SEARCH_FIELD_KEYS = entrySearchModel.ENTRY_SEARCH_FIELD_KEYS;
const qualityModel = window.ConlexiconQuality;
const QueryPageCache = window.ConlexiconQueryPageCache.QueryPageCache;
const queryPageCache = new QueryPageCache({
  maxEntries: 4,
  maxBytes: 16 * 1024 * 1024,
});
const entryDetailCache = new QueryPageCache({
  maxEntries: 12,
  maxBytes: 12 * 1024 * 1024,
});
let docsViewMode = "split";
let docsSaveTimer = null;
let corpusSaveTimer = null;
let corpusSavePromise = null;
let corpusSaveRequested = false;
let corpusUnitPreviewFrame = null;
let lastDuplicateEntityIdAlert = "";
let docsDraftState = null;
let confirmDialogResolver = null;
let confirmDialogResults = { cancel: false, alternate: false, accept: true };
const viewScrollMemory = {
  docsPage: 0,
  docsEditor: 0,
  docsPreview: 0,
  analysisPage: 0,
};
let sourceSuggestionIndex = 0;
let sourceSuggestionHideTimer = 0;
let networkEntryId = "";
let networkOpen = false;
let partialEditSection = "";
let partialEditHost = null;
const expandedMorphologyTables = new Set();
let rootMode = false;
let rootExpansionMode = "manual";
const expandedRootEntries = new Set();
const collapsedRootEntries = new Set();
let rootNavigationContextId = "";
let entryDraft = null;
const defaultAnalysisViewState = {
  page: "overview",
  subpageByPage: {
    entries: "tags",
    ipa: "distribution",
    morphology: "tables",
    activity: "updated",
  },
  scrollByRoute: {},
};
const defaultQualityViewState = {
  subpage: "issues",
  scrollBySubpage: {},
};
const analysisViewStates = new Map();
const qualityViewStates = new Map();
const corpusViewStates = new Map();
let corpusDraftState = null;
const DEFAULT_TOOL_NAV_ORDER = ["editor", "docs", "corpus", "analysis", "quality", "ipa", "morphology-functions", "morphology-tables", "settings", "manager"];
const DEFAULT_ENTRY_SECTION_ORDER = ["definitions", "etymology", "derived", "morphology", "notes"];
const ENTRY_LIST_PART_DISPLAY_OPTIONS = ["subtitle", "chips", "both"];
let advancedFilter = null;
let entryQueryState = {
  key: "",
  status: "idle",
  items: [],
  pageInfo: null,
  error: null,
  requestId: 0,
  pages: [],
  visiblePageIndexes: new Set(),
  windowCursor: "",
  updateToken: 0,
};
let entryFacetsState = {
  key: "",
  status: "idle",
  parts: [],
  error: null,
  requestId: 0,
};
let rootGroupsQueryState = {
  key: "",
  status: "idle",
  groups: [],
  pageInfo: null,
  error: null,
  requestId: 0,
  pages: [],
  visiblePageIndexes: new Set(),
  windowCursor: "",
  updateToken: 0,
};
const rootGroupDerivedStates = new Map();
let selectedEntryDetailState = {
  dictionaryId: "",
  entryId: "",
  status: "idle",
  entry: null,
  staleEntry: null,
  error: null,
  requestId: 0,
};
let selectedEntryDetailLoadPromise = null;
const entryRelationsCache = new Map();
const ENTRY_RELATIONS_CACHE_MAX = 24;
let qualityReportCache = null;
let analysisFilterCounter = 0;
const analysisFilterRegistry = new Map();
let draggedToolNavView = "";
let draggedEntrySectionId = "";
let draggedMorphologyGroupId = "";
let draggedMorphologyTableId = "";
let entryCardScrollRequestId = 0;
let pendingEntryCardScroll = null;
let entryBrowserHeightFrame = 0;
let entryBrowserLayoutRefreshFrame = 0;
let entryBrowserLayoutRefreshUntil = 0;
let activeEntryContextMenu = null;
const entryVirtualList = createVirtualListState(145);
const corpusVirtualList = createVirtualListState(74);
const masonryLayouts = new WeakMap();
const VIRTUAL_LIST_RESIZE_EPSILON = 0.5;
const VIRTUAL_LIST_ACTIVE_SCROLL_MS = 180;
const VIRTUAL_LIST_RENDER_THROTTLE_MS = 50;
const VIRTUAL_LIST_RESIZE_THROTTLE_MS = 500;
const VIRTUAL_LIST_RESIZE_IDLE_FLUSH_MS = 180;
const VIRTUAL_LIST_HEIGHT_CACHE_WIDTH_BUCKET = 24;
const VIRTUAL_LIST_HEIGHT_CACHE_LIMIT = 50000;
const STALE_CONTENT_UPDATE_DELAY_MS = 200;
const DEFAULT_ANALYSIS_ROOT_FAMILY_LIMIT = 12;
let staleContentUpdateSequence = 0;
let entryListHasSettledContent = false;
let entryDetailHasSettledContent = false;
const staleContentUpdates = {
  list: { token: 0, timer: 0, pending: false, hasStaleContent: false, showing: false },
  detail: { token: 0, timer: 0, pending: false, hasStaleContent: false, showing: false },
};

const i18n = {
  zh: {
    appTitle: "构典",
    toolNavigation: "工具导航",
    collapseNavigation: "收起工具导航",
    expandNavigation: "展开工具导航",
    openToolNavigation: "打开工具导航",
    closeToolNavigation: "关闭工具导航",
    entryBrowser: "词条列表",
    entryDetail: "词条详情",
    partFilterLabel: "词性筛选",
    entrySortLabel: "词条排序",
    collapseEntryBrowser: "收起词条列表",
    expandEntryBrowser: "展开词条列表",
    openEntryList: "打开词条列表",
    closeEntryList: "关闭词条列表",
    entryEditor: "词条编辑",
    dictionaryConfig: "词典配置",
    docsModeLabel: "文档模式",
    corpusModeLabel: "语料类型",
    current: "当前",
    planned: "待实装",
    ipaConfig: "自动 IPA 标注",
    analysis: "数据分析",
    qualityCheck: "质量检查",
    languageDocs: "语言文档",
    corpus: "语料库",
    morphologyConfig: "自动形态学",
    morphologyFunctions: "形态函数",
    morphologyDisplay: "形态学",
    morphologyGroup: "形态组",
    morphologyNeedDictionary: "自动形态学配置会保存到当前词典文件中。",
    qualityNeedDictionary: "质量检查会根据当前词典中的词条、标签、词源、IPA 和 Glossed 例句实时生成。",
    morphologyTables: "形态表格",
    morphologyFunctionObjects: "函数识别对象",
    morphologyFunctionObjectsHelp: "为 leftV/rightV 配置它们会识别的对象。函数被规则使用时必须先配置；函数会先找到最近的已配置对象，再判断它是否属于括号中的候选项。多个对象用逗号分隔。",
    morphologyLeftVObjects: "leftV 识别对象",
    morphologyRightVObjects: "rightV 识别对象",
    invalidMorphologyFunctionObjects: "形态配置中存在未配置的函数对象",
    invalidMorphologySyntax: "形态配置中存在不合法的替换语法",
    morphologyTable: "形态表格",
    morphologyTableGroup: "形态表格组",
    morphologyTableGroupName: "表格组标题",
    morphologyTableGroupNotes: "表格组备注",
    addMorphologyTableGroup: "新建表格组",
    addMorphologyTable: "添加表格",
    tableName: "表格标题",
    tableSize: "表格尺寸",
    rowCount: "行数",
    columnCount: "列数",
    rowLabels: "行标签",
    columnLabels: "列标签",
    autoMatchTags: "自动匹配标签",
    referenceMode: "引用",
    replacementMode: "替换",
    applySize: "应用尺寸",
    removeTable: "删除表格",
    removeMorphologyTableGroup: "删除表格组",
    emptyMorphologyTableGroup: "此表格组暂无表格。",
    dragMorphologyTableGroup: "拖动以调整表格组排序",
    dragMorphologyTable: "拖动以调整表格排序",
    morphologyAuto: "自动匹配",
    morphologyNone: "不使用表格",
    morphologyMode: "形态模式",
    morphologyManual: "手动配置",
    switchToManualMorphology: "改为手动配置",
    switchToManualMorphologyConfirm: "改为手动配置会保留当前自动命中的形态组，并一并转移当前未显示的形态覆盖。之后若恢复自动匹配，所有这些手动形态组、标题、备注和单元格覆盖都会被清空。是否继续？",
    restoreAutoMorphology: "恢复自动匹配",
    restoreAutoMorphologyConfirm: "恢复自动匹配将放弃当前手动形态组及其标题、备注和单元格覆盖。是否继续？",
    morphologyManualGroups: "手动形态组",
    addEntryMorphologyGroup: "添加形态组",
    removeEntryMorphologyGroup: "移除形态组",
    entryMorphologyGroupTitle: "组标题覆盖",
    entryMorphologyGroupNotes: "词条形态备注",
    useTemplateGroupTitle: "留空则使用表格组标题",
    morphologyOverrideHelp: "留空则使用表格规则；填写内容会覆盖对应栏目。",
    morphologyRuleSyntaxHelp: "使用 {} 引用词形；{a = e} 引用并替换词形；/leftV(a,o,u) = lar; rightV(e,i,ö,ü) = ler; else = / 按最近左侧或右侧音位选择输出；else 可留空。",
    morphologySyntaxTitle: "形态语法",
    morphologySyntaxInfo: "查看形态语法",
    morphologySyntaxIntro: "每个单元格最终输出一个字符串。普通字符会原样输出，{} 会引用当前词条的词形。系统会先展开所有 {} / {X = Y}，然后再执行 /.../ 条件判断。",
    morphologySyntaxLemma: "{}：直接引用词形。例如 {}-ka 会输出 lemma-ka。",
    morphologySyntaxReplace: "{X = Y}：引用词形并把第一个 X 替换为 Y，等同于 {X[1] = Y}。{X[n] = Y} 替换从左到右第 n 个 X；{X[-n] = Y} 替换从右到左第 n 个 X；{X[*] = Y} 替换所有 X。多条规则都只在原始词形上定位，不会使用其他规则生成后的结果。",
    morphologySyntaxCondition: "/条件 = 输出; 条件 = 输出; else = 输出/：从左到右判断，命中第一条后输出对应内容。",
    morphologySyntaxContext: "leftV(a,o,u) 检测当前位置左侧最近的已配置对象；rightV(e,i,ö,ü) 检测右侧最近的已配置对象。left(a,o,u)(n) / right(a,o,u)(n) 检测左侧或右侧第 n 个字符，n 只能填入正整数。当第二个括号留空时，默认 n = 1。由于引用会先展开，左侧使用已经生成的展开结果，右侧使用后续展开结果的预览。",
    morphologySyntaxElse: "else 可以留空，留空表示不插入任何内容。调试时可写 else = ! 来标记未命中规则。",
    morphologySyntaxSpacing: "等号和逗号周围的空格会被忽略。替换目标两端空格也会被去掉。",
    morphologySyntaxExamples: "示例：{}/leftV(a,o,u) = lar; leftV(e,i,ö,ü) = ler; else = !/。前缀可写 /rightV(a,o,u) = ka; rightV(e,i,ö,ü) = ke; else = !/{}。字符检查可写 {}r/left(r) = a; left(n)(2) = b; else = !/。显式替换可写 {a[1] = e, a[-1] = o, n[*] = m}。",
    close: "关闭",
    expand: "展开",
    collapse: "收起",
    otherSettings: "其他设置",
    settings: "设置",
    darkMode: "暗黑模式",
    lightMode: "浅色模式",
    newEntry: "新建词条",
    quickNewEntryTooltip: "新建词条",
    insertSymbol: "插入 {symbol}",
    backendOffline: "后端未连接",
    openViaServer: "请通过本地服务打开 Conlexicon",
    backendFileMessage: "当前是 file:// 页面，无法调用后端 API。",
    backendApiMessage: "无法连接后端 API。",
    backendHint: "启动后端后，请访问 http://localhost:4173/。",
    noDictionary: "尚未创建词典",
    createDictionaryFirst: "先创建一个词典",
    emptyDictionaryBody: "词条编辑器会在存在当前词典后显示。进入词典管理即可新建、导入或切换词典。",
    openDictionaryManager: "打开词典管理",
    searchPlaceholder: "搜索词形、释义、标签",
    allParts: "全部词性",
    noPart: "无词性",
    rootMode: "词根模式",
    normalMode: "普通模式",
    expandAll: "全部展开",
    collapseAll: "全部收起",
    advancedFilterMode: "高级筛选",
    exitAdvancedFilter: "退出",
    refreshAdvancedFilter: "刷新高级筛选",
    cycleAdvancedFilter: "切换筛选条件",
    qualityFilterInfo: "查看质量筛选说明",
    qualityFilterInfoTitle: "质量筛选说明",
    qualityFilterInfoBody: "点击质量类别按钮只会切换本页显示的问题列表；点击“在词条列表查看”才会启用高级筛选，并在词条列表中查看全部有当前类别质量问题的词条。词条卡片下方会显示对应的问题类型，悬浮可查看具体问题。按优先度筛选会在全部、高、中、低之间循环；按检查模块筛选会在词形、标签、IPA、词源网络、Glossed 例句和其他问题之间循环。",
    qualityCurrentCategory: "当前类别",
    viewQualityEntries: "在词条列表查看",
    qualityEntryCount: "个词条",
    sortLemmaAsc: "首字母正序",
    sortLemmaDesc: "首字母倒序",
    sortUpdatedAsc: "编辑时间正序",
    sortUpdatedDesc: "编辑时间倒序",
    sortCreatedAsc: "创建时间正序",
    sortCreatedDesc: "创建时间倒序",
    editEntry: "编辑词条",
    entryContextMenu: "词条操作",
    createDerivedEntry: "新建衍生条目",
    partialEdit: "局部编辑",
    definitions: "释义",
    etymology: "词源",
    entryNotes: "词条备注",
    delete: "删除",
    lemma: "词形",
    pronunciation: "发音",
    autoIpa: "自动 IPA",
    tagsLabel: "属性标签（第一个标签会作为词性）",
    definitionList: "多条释义",
    addDefinition: "添加释义",
    etymologyInfo: "来源与说明",
    sourceEntry: "来源词条",
    etymologyDescription: "说明",
    dictionarySettingsEyebrow: "当前词典",
    settingsNeedDictionary: "其他设置会保存到当前词典文件中。",
    glossSettings: "Gloss 渲染",
    glbSmallCaps: "将 \\glb 中的小写字母渲染为 small caps",
    corpusRendering: "渲染",
    corpusRenderPattern: "渲染对象",
    corpusRenderPatternHelp: "留空时将对应内容作为纯文本原样显示并保持换行，不识别 Gloss 格式。填写时仅接受 \\gla、\\glb、\\glc、\\ft；配置中的每一行对应一条输出行，多条非 \\ft 输出行可按词位对齐。用括号包裹对象（如 (\\gla)）可在内容缺失时跳过该对象。",
    corpusCardRendering: "语料单元卡片",
    corpusUnitNameRendering: "语料单元名称（内容）",
    entryExampleRendering: "词条例句",
    corpusCardGlossAlign: "卡片中对齐多行 Gloss",
    corpusUnitGlossAlign: "单元名称中对齐多行 Gloss",
    entryExampleGlossAlign: "例句中对齐多行 Gloss",
    glossFontFamily: "渲染字体",
    glossFontSize: "渲染字号",
    glossStyleBold: "粗体",
    glossStyleItalic: "斜体",
    glossStyleSmallCaps: "Small caps",
    fontSerif: "衬线",
    fontSans: "无衬线",
    fontMono: "等宽",
    fontSizeSmall: "小",
    fontSizeMedium: "中",
    fontSizeLarge: "大",
    invalidCorpusRenderPattern: "渲染对象只能包含 \\gla、\\glb、\\glc、\\ft、用于可选对象的括号和换行。",
    corpusRenderError: "单元名称渲染错误",
    searchSettings: "搜索",
    searchDisplay: "显示",
    save: "保存",
    fuzzySearch: "模糊匹配",
    searchFields: "搜索字段",
    searchField: "字段",
    searchFieldEnabled: "参与搜索",
    searchFieldFuzzy: "模糊匹配",
    searchFieldLemma: "词形",
    searchFieldPronunciation: "IPA",
    searchFieldTags: "标签",
    searchFieldDefinitions: "释义",
    searchFieldExamples: "例句",
    searchFieldNotes: "备注",
    searchFieldEtymology: "词源",
    searchFieldMorphology: "形态学",
    searchFieldMorphologyHelp: "形态字段由规则动态生成，启用搜索可能明显增加大型词典的搜索耗时。",
    searchNormalization: "搜索规范化",
    searchNfcHelp: "将等价的 Unicode 组合形式统一为 NFC",
    searchCaseFoldingHelp: "忽略 Unicode 字符的大小写差异",
    searchCustomRules: "自定义等价规则",
    searchCustomRulesHelp: "将每行变体统一匹配为一个标准形式。规则按最长变体优先，且不会递归套用。",
    searchCanonical: "标准形式",
    searchVariants: "等价变体（每行一个）",
    addSearchNormalizationRule: "添加规则",
    removeSearchNormalizationRule: "删除规则",
    searchNormalizationInvalidRule: "自定义搜索规则无效。",
    searchNormalizationEmptyCanonical: "请填写规则的标准形式。",
    searchNormalizationEmptyVariants: "请至少填写一个等价变体。",
    searchNormalizationConflictingVariant: "同一个等价变体不能对应多个标准形式。",
    etymologyAutocomplete: "词源自动补全",
    sourceFuzzyHelp: "在词源来源补全中启用模糊匹配",
    searchFieldRequired: "请至少启用一个搜索字段。",
    searchHighlightHelp: "搜索时高亮显示匹配结果",
    switchEntrySettings: "切换词条",
    editEntrySettings: "编辑词条",
    savePartialOnSwitch: "切换页面时处理局部编辑",
    saveFullOnSwitch: "切换页面时处理完整编辑",
    editSwitchSave: "保存",
    editSwitchDiscard: "放弃更改",
    editSwitchPrompt: "弹窗提示",
    partialEditSwitchPrompt: "当前局部编辑尚未处理。请选择保存更改、放弃更改，或取消当前操作。",
    fullEditSwitchPrompt: "当前完整编辑尚未处理。请选择保存更改、放弃更改，或取消当前操作。",
    autoSaveSettings: "自动保存",
    corpusAutoSave: "语料库自动保存",
    docsAutoSave: "语言文档自动保存",
    allowEmptyPronunciation: "允许发音留空时保存",
    allowEmptyTags: "允许标签留空时保存",
    allowEmptyDefinitions: "允许释义留空时保存",
    requiredPronunciation: "请填写发音",
    requiredTags: "请填写至少一个标签",
    requiredDefinition: "请填写至少一条释义",
    unsavedSettingsConfirm: "其他设置中有未保存的更改。请选择保存、放弃更改，或取消当前操作。",
    unsavedIpaConfirm: "自动 IPA 标注中有未保存的更改。请选择保存、放弃更改，或取消当前操作。",
    unsavedDictionaryConfirm: "词典设置中有未保存的更改。请选择保存、放弃更改，或取消当前操作。",
    unsavedMorphologyConfirm: "自动形态学中有未保存的更改。请选择保存、放弃更改，或取消当前操作。",
    unsavedCorpusConfirm: "语料库中有未保存的更改。请选择保存、放弃更改，或取消当前操作。",
    unsavedDocsConfirm: "语言文档中有未保存的更改。请选择保存、放弃更改，或取消当前操作。",
    tags: "标签",
    entryTagSettings: "词条标签",
    tagDisplayReplacement: "标签显示替换",
    tagDisplayReplacementHelp: "每行一条，格式为 原标签 = 显示文本。仅影响查看模式中的显示，不改变词条数据。",
    entryListRawTagDisplay: "词条列表中显示原始标签",
    entryListTagDisplayLimit: "词条列表中标签显示上限",
    entryListTagDisplayLimitHelp: "设为 n 时，超过 n 个标签会显示前 n-1 个和省略号。默认为 3。",
    entryListTagDisplayLimitInvalid: "词条列表标签显示上限必须是 2 到 10 之间的整数。",
    entryListPartDisplay: "词条列表中词性显示位置",
    entryListPartDisplaySubtitle: "副标题",
    entryListPartDisplayChips: "标签区",
    entryListPartDisplayBoth: "两者均显示",
    tagTooltipRawTag: "原始标签",
    tagTooltipDisplayReplacement: "显示替换",
    partOfSpeechTagSettings: "词性标签",
    manualPartOfSpeechTags: "手动配置词性标签",
    partOfSpeechTagsHelp: "开启后，仅这里列出的标签会被识别为词性；多个标签用逗号分隔。关闭时仍保留内容，但使用第一个词条标签作为词性。",
    tagOrderSettings: "自动整理标签顺序",
    tagOrderHelp: "输入统一标签顺序，多个标签用逗号分隔。填写原始标签，不填写显示替换后的文本。",
    tagOrderInfo: "查看标签排序逻辑",
    tagOrderInfoBody: "点击刷新后，系统会按输入框中的统一顺序重排每个词条的标签。统一顺序里有而某个词条没有的标签会被跳过；某个词条里有但统一顺序里没有的标签会保留在末尾，多个额外标签保持原始相对顺序。这里应填写原始标签；显示替换只影响界面显示，不参与匹配。",
    tagOrderConfirm: "将按照当前输入的统一顺序重排当前词典中所有词条的标签，并立即保存。继续吗？",
    tagOrderUnsavedSettingsConfirm: "当前其他设置有未保存更改。请先保存设置后再自动整理标签顺序。",
    tagOrderApplied: "标签顺序已整理",
    tagOrderEmpty: "请先输入至少一个标签。",
    saveAndApply: "保存并应用",
    applyTags: "应用",
    tagDisplaySettings: "标签突出显示",
    tagRedHighlightHelp: "配置后，这些标签会在词条浏览栏和查看界面中以红色显示。多个标签用逗号、空格或换行分隔。",
    tagFilterSettings: "标签筛选",
    entryListTagFilteringHelp: "在词条列表中点击标签时启用筛选",
    displaySettings: "显示",
    polysemyDisplay: "多义项显示",
    entryListPolysemyDisplay: "词条列表的多义项显示",
    networkPolysemyDisplay: "词汇网络悬浮卡片的多义项显示",
    emptyEntrySections: "空栏目",
    showEmptyEntrySections: "在词条浏览界面显示空栏目",
    entrySectionOrder: "词条栏目排序",
    entrySectionOrderHelp: "拖动卡片以调整词条详情和完整编辑中栏目顺序。衍生词只在有内容时显示，且不可在完整编辑中修改。",
    ipaKeyboardSettings: "IPA 虚拟键盘",
    ipaKeyboardSymbols: "键盘符号",
    ipaKeyboardHelp: "以空格、逗号或换行分隔。新词典默认包含 ˈ 和 ˌ。",
    interfaceLayout: "界面布局",
    toolNavigationOrder: "工具导航排序",
    toolNavigationOrderHelp: "拖动卡片来调整左侧导航栏顺序。该顺序保存到当前词典文件中。",
    cancel: "取消",
    confirm: "确认",
    confirmTitle: "确认操作",
    clear: "清空",
    saveEntry: "保存词条",
    dictionaryManagerEyebrow: "多词典管理",
    dictionaryManager: "词典管理",
    backToEditor: "返回编辑器",
    newDictionary: "新建词典",
    managerNeedsBackend: "词典管理需要本地后端",
    deleteDictionary: "删除词典",
    name: "名称",
    language: "语言",
    description: "描述",
    exportJson: "导出 JSON",
    importJson: "导入 JSON",
    saveConfig: "保存配置",
    unnamedDictionary: "未命名词典",
    dictionary: "词典",
    entries: "个词条",
    roots: "个词根",
    noEntries: "还没有词条",
    noEntriesBody: "新建第一个词条后，这里会显示词条详情。",
    noMatch: "没有匹配的词条",
    noMatchBody: "可以新建词条，或调整搜索与筛选条件。",
    entryResultsTruncated: "当前仅加载 {loaded} / {total} 个词条",
    rootGroupsTruncated: "当前仅加载 {loaded} / {total} 个词根组",
    noDescription: "暂无描述",
    config: "配置",
    setCurrent: "设为当前",
    new: "新建",
    edit: "编辑",
    entry: "词条",
    meaning: "释义",
    example: "例句",
    definitionNote: "释义备注",
    removeDefinition: "删除释义",
    none: "无",
    wholeEntryNote: "词条整体备注",
    requiredEntry: "请填写词形",
    missingDefinition: "尚未填写释义",
    savedEntry: "词条已保存",
    noChangesToSave: "没有需要保存的更改",
    derivedEntryDraft: "已创建衍生词草稿",
    deletedEntry: "词条已删除",
    createDictionaryFirstToast: "请先创建词典",
    saveFailed: "保存失败",
    deleteConfirmEntry: "删除词条",
    deleteConfirmDictionary: "删除词典",
    andItsEntries: "及其中",
    switchToolPlanned: "该功能入口已预留，后续实装",
    dictionarySaved: "词典配置已保存",
    dictionaryCreated: "词典已创建",
    dictionaryDeleted: "词典已删除",
    dictionarySaveFailed: "保存词典失败",
    dictionaryDeleteFailed: "删除词典失败",
    dictionarySwitchFailed: "切换词典失败",
    switchedTo: "已切换到",
    imported: "数据已导入",
    importFailed: "无法读取这个 JSON 文件",
    languageSaveFailed: "界面语言保存失败",
    themeSaveFailed: "界面主题保存失败",
    apiErrorRequestBodyTooLarge: "保存内容过大",
    apiErrorInvalidJsonBody: "请求内容不是有效 JSON",
    apiErrorInvalidUiLanguage: "界面语言值无效",
    apiErrorInvalidUiTheme: "界面主题值无效",
    apiErrorInvalidImportPayload: "导入文件格式无效",
    apiErrorInvalidDictionaryId: "词典 ID 格式无效",
    apiErrorDictionaryNotFound: "词典不存在或已被删除",
    apiErrorDictionaryIdExists: "词典 ID 已存在，需要确认覆盖",
    apiErrorDuplicateEntityIds: "词典中存在重复 ID",
    apiErrorDuplicateEntityIdsScoped: "当前保存范围存在重复 ID",
    apiErrorInvalidEntryPayload: "词条保存请求格式无效",
    apiErrorEntryIdExists: "词条 ID 已存在",
    apiErrorInvalidEntryUpdatesPayload: "批量词条更新格式无效",
    apiErrorEntryNotFound: "词条不存在或已被删除",
    apiErrorInvalidSettingsPayload: "设置保存请求格式无效",
    apiErrorInvalidDocsPayload: "语言文档保存请求格式无效",
    apiErrorInvalidCorpusPayload: "语料库保存请求格式无效",
    apiErrorInvalidMorphologyPayload: "形态学保存请求格式无效",
    apiErrorInvalidIpaSettingsPayload: "IPA 设置保存请求格式无效",
    apiErrorUnsupportedEntryPatchFields: "批量词条更新包含不支持的字段",
    apiErrorEntryPatchTagsInvalid: "批量标签更新格式无效",
    apiErrorEntryPatchPronunciationInvalid: "批量 IPA 更新格式无效",
    apiErrorSystemFilePermission: "文件权限不足，无法写入",
    apiErrorSystemDiskFull: "磁盘空间不足，无法保存",
    apiErrorSystemFileBusy: "文件正被占用，无法保存",
    apiErrorSystemFileMissing: "目标文件不存在或已被移动",
    apiErrorSystemJsonParse: "本地 JSON 文件损坏或无法解析",
    apiErrorNetwork: "无法连接到本地服务",
    apiErrorUnknown: "发生未知错误",
    importOverwriteTitle: "词典 ID 已存在",
    importOverwriteMessage: "词典 ID“{id}”已经存在。导入“{name}”将覆盖现有词典及其全部数据。",
    importAndOverwrite: "导入并覆盖",
    importInvalidIdTitle: "词典 ID 格式无效",
    importInvalidIdMessage: "词典 ID“{id}”格式无效。是否作为新词典导入并重新生成 ID？",
    importAndRegenerateId: "重新生成 ID 并导入",
    updatedAt: "修订日期",
    source: "来源",
    derivedEntries: "衍生",
    ipaNeedDictionary: "自动 IPA 标注规则会保存到当前词典文件中。",
    orthographyModule: "正写法识别",
    orthographyStressModule: "正写法重音映射",
    mappingRules: "映射规则",
    addMapping: "添加映射",
    addStressMapping: "添加重音映射",
    mappingRuleHelp: "规则从上到下匹配；输入与前后条件始终只读取原始词形，生成结果不会被后续规则再次读取。较前规则消耗的字符不会再参与后续匹配，可拖动规则调整优先级。输出中写入 ˈ 或以 ' 开头，可将该音节标为重读并覆盖默认重音。",
    stressMappingHelp: "输出中写入 ˈ 或以 ' 开头，可将该音节标为重读并覆盖默认重音。",
    syllabification: "音节划分",
    syllableRules: "音节规则",
    ipaSyllableHelpTitle: "音节划分逻辑",
    ipaSyllableHelpInfo: "查看音节划分逻辑",
    ipaSyllableHelpBody: "自动 IPA 会先执行正写法映射。映射后的结果会按复杂音位切成单位；复杂音位始终作为一个单位参与后续判断。\n\n随后系统用元音音位寻找音节核心。两个元音核心之间的辅音串会被分配到相邻音节边界。\n\n优先级为：复杂音位分词 → 寻找元音核心 → 检查合法音节首辅音簇 → 检查合法音节尾辅音簇 → 默认中间切分。\n\n音节首辅音簇用于把匹配到的末段辅音串整体分给后一个音节；音节尾辅音簇用于把匹配到的前段辅音串整体留给前一个音节。若无法命中配置，就按默认逻辑把中间辅音串尽量居中切开。\n\n音节分隔符只影响输出显示，不改变内部识别单位。重音标注在音节划分之后执行。",
    vowels: "元音音位",
    syllableSeparator: "音节分隔符",
    onsetClusters: "音节首辅音簇",
    codaClusters: "音节尾辅音簇",
    complexPhonemes: "复杂音位",
    defaultStressPosition: "默认重音位置",
    stressRules: "重音规则",
    defaultStressHelp: "整数。正数为正数第几音节，负数为倒数第几音节；0 表示不标默认重音。词更短时落在可达到的最远位置。",
    unstressMonosyllables: "单音节词不标重音",
    batchIpaAll: "重写全部发音",
    batchIpaMissing: "补全空发音",
    batchIpaAllConfirm: "将为当前词典所有有词形的词条重新生成发音，并覆盖已有发音。确定继续吗？",
    batchIpaMissingConfirm: "将为当前词典所有尚未填写发音且有词形的词条生成发音。确定继续吗？",
    batchIpaUnsavedSettingsConfirm: "当前自动 IPA 设置有未保存更改。请先保存设置后再批量生成。",
    saveAndGenerate: "保存并生成",
    batchIpaUpdated: "已更新发音",
    batchIpaNoMissing: "当前词典无发音为空的条目",
    ruleFrom: "输入",
    ruleTo: "输出",
    ruleBefore: "前接条件",
    ruleAfter: "后接条件",
    reorderIpaRule: "拖动调整规则顺序",
    removeRule: "删除规则",
    ipaSaved: "IPA 配置已保存",
    ipaGenerated: "已生成 IPA",
    ipaNeedsLemma: "请先填写词形",
    ipaDefaultStressInvalid: "默认重音必须是整数",
    ipaSandbox: "IPA 沙盒",
    ipaSandboxInput: "输入",
    ipaSandboxMapped: "映射",
    ipaSandboxSyllables: "音节划分",
    ipaSandboxFinal: "最终输出",
    docsNeedDictionary: "语言文档会保存到当前词典文件中。",
    analysisNeedDictionary: "数据分析会根据当前词典中的词条、标签、词源、IPA 和形态学配置实时生成。",
    splitMode: "分栏",
    editMode: "编辑",
    previewMode: "查看",
    saveDocs: "保存文档",
    docsSaved: "文档已保存",
    corpusNeedDictionary: "语料库会保存到当前词典文件中。",
    saveCorpus: "保存语料库",
    corpusSaved: "语料库已保存",
    corpusBlocks: "块",
    corpusUnits: "单元",
    newCorpusBlock: "新建块",
    newCorpusUnit: "新建单元",
    corpusSearchPlaceholder: "搜索块或单元",
    noCorpusBlocks: "还没有语料块",
    noCorpusUnits: "还没有语料单元",
    noCorpusSelection: "从左侧选择一项，或新建内容。",
    corpusBlock: "语料块",
    corpusLayer: "语料层",
    corpusUnit: "语料单元",
    corpusBlockTitle: "块标题",
    corpusUnitContent: "单元内容",
    corpusTags: "标签",
    corpusTagsHelp: "使用逗号或换行分隔。",
    corpusNotes: "备注",
    corpusAttributes: "属性",
    addAttribute: "添加属性",
    attributeName: "属性名",
    attributeValue: "属性值",
    removeAttribute: "删除属性",
    directUnits: "块直属单元",
    corpusLayers: "层",
    addLayer: "添加层",
    layerName: "层名称",
    speaker: "发言人",
    modality: "模态",
    linkedUnits: "关联单元",
    chooseUnit: "选择单元",
    linkUnit: "关联单元",
    unlink: "解除链接",
    moveUp: "上移",
    moveDown: "下移",
    deleteCorpusBlock: "删除块",
    deleteCorpusLayer: "删除层",
    deleteCorpusUnit: "删除单元",
    deleteCorpusBlockConfirm: "删除这个块？其中的层会一并删除，关联单元将变为孤立单元。",
    deleteCorpusLayerConfirm: "删除这个层？关联单元将变为孤立单元。",
    deleteCorpusUnitConfirm: "删除这个单元？它也会从当前父级解除链接。",
    corpusParent: "父级链接",
    corpusOrphan: "孤立单元",
    corpusBlockParent: "块",
    corpusLayerParent: "层",
    effectiveAttributes: "生效属性",
    effectiveAttributesHelp: "层内单元依次继承块和层属性，单元自己的同名属性优先。单独写入的属性始终保留在单元中。",
    noEffectiveAttributes: "暂无生效属性",
    attributeSourceBlock: "块",
    attributeSourceLayer: "层",
    attributeSourceUnit: "单元",
    corpusLinkMovesUnit: "关联操作会先解除该单元原有的父级链接。",
    corpusIntegrityTitle: "检测到语料完整性问题",
    corpusIntegrityHelp: "手动编辑 JSON 可能造成重复 ID、无效链接或多父级链接。请检查以下项目。",
    corpusMultipleParents: "单元“{unit}”被链接到多个父级：{parents}",
    corpusMissingUnit: "父级“{parent}”引用了不存在的单元：{unit}",
    corpusDuplicateLink: "父级“{parent}”重复引用了单元“{unit}”",
    corpusDuplicateEntityId: "语料 ID“{id}”被多个对象使用：{types}",
    duplicateEntityIdsTitle: "检测到重复 ID",
    duplicateEntityIdsMessage: "以下 ID 被多个词典对象使用，保存或导入已停止：\n{details}",
    entryEntity: "词条",
    definitionEntity: "释义",
    morphologyTableEntity: "形态表",
    corpusBlockFallback: "未命名块",
    corpusLayerFallback: "未命名层",
    corpusUnitFallback: "空单元",
    corpusRequiredBlockTitle: "请填写块标题",
    corpusRequiredUnitContent: "请填写单元内容",
    corpusBlockStats: "{layers} 层 · {units} 单元",
    corpusUnitParentLabel: "父级：{parent}",
    lexicalNetwork: "词汇网络",
    closeNetwork: "关闭网络",
    lexicalNetworkLoading: "正在加载词汇网络",
    contentUpdating: "正在更新",
    lexicalNetworkLoadFailed: "无法加载词汇网络",
  },
  en: {
    appTitle: "Constructed Language Dictionary",
    toolNavigation: "Tool navigation",
    collapseNavigation: "Collapse tool navigation",
    expandNavigation: "Expand tool navigation",
    openToolNavigation: "Open tool navigation",
    closeToolNavigation: "Close tool navigation",
    entryBrowser: "Entry list",
    entryDetail: "Entry details",
    partFilterLabel: "Part-of-speech filter",
    entrySortLabel: "Entry sorting",
    collapseEntryBrowser: "Collapse entry list",
    expandEntryBrowser: "Expand entry list",
    openEntryList: "Open entry list",
    closeEntryList: "Close entry list",
    entryEditor: "Entries",
    dictionaryConfig: "Dictionary configuration",
    docsModeLabel: "Document view mode",
    corpusModeLabel: "Corpus item type",
    current: "Current",
    planned: "Planned",
    ipaConfig: "Auto IPA",
    analysis: "Analytics",
    qualityCheck: "Quality Checks",
    languageDocs: "Language Docs",
    corpus: "Corpus",
    morphologyConfig: "Auto Morphology",
    morphologyFunctions: "Morphology Functions",
    morphologyDisplay: "Morphology",
    morphologyGroup: "Morphology Group",
    morphologyNeedDictionary: "Auto morphology config is saved in the current dictionary file.",
    qualityNeedDictionary: "Quality checks are generated live from the current dictionary's entries, tags, etymology, IPA, and Glossed examples.",
    morphologyTables: "Morphology Tables",
    morphologyFunctionObjects: "Function Recognition Objects",
    morphologyFunctionObjectsHelp: "Configure the objects recognized by leftV/rightV. A function must be configured before rules can use it; the function finds the nearest configured object first, then checks whether it is in the candidates inside parentheses. Separate objects with commas.",
    morphologyLeftVObjects: "leftV Objects",
    morphologyRightVObjects: "rightV Objects",
    invalidMorphologyFunctionObjects: "Morphology config contains unconfigured function objects",
    invalidMorphologySyntax: "Morphology config contains invalid replacement syntax",
    morphologyTable: "Morphology Table",
    morphologyTableGroup: "Morphology Table Group",
    morphologyTableGroupName: "Table Group Title",
    morphologyTableGroupNotes: "Table Group Notes",
    addMorphologyTableGroup: "New Table Group",
    addMorphologyTable: "Add Table",
    tableName: "Table Title",
    tableSize: "Table Size",
    rowCount: "Rows",
    columnCount: "Columns",
    rowLabels: "Row Labels",
    columnLabels: "Column Labels",
    autoMatchTags: "Auto Match Tags",
    referenceMode: "Reference",
    replacementMode: "Replacement",
    applySize: "Apply Size",
    removeTable: "Delete Table",
    removeMorphologyTableGroup: "Delete Table Group",
    emptyMorphologyTableGroup: "This table group has no tables yet.",
    dragMorphologyTableGroup: "Drag to reorder table groups",
    dragMorphologyTable: "Drag to reorder tables",
    morphologyAuto: "Auto Match",
    morphologyNone: "No Table",
    morphologyMode: "Morphology Mode",
    morphologyManual: "Manual Configuration",
    switchToManualMorphology: "Switch to Manual",
    switchToManualMorphologyConfirm: "Switching to manual configuration preserves the currently matched morphology groups and any hidden morphology overlays. Restoring auto matching later will clear all of these manual groups, titles, notes, and cell overrides. Continue?",
    restoreAutoMorphology: "Restore Auto Match",
    restoreAutoMorphologyConfirm: "Restoring auto matching will discard the current manual morphology groups, titles, notes, and cell overrides. Continue?",
    morphologyManualGroups: "Manual Morphology Groups",
    addEntryMorphologyGroup: "Add Morphology Group",
    removeEntryMorphologyGroup: "Remove Morphology Group",
    entryMorphologyGroupTitle: "Group Title Override",
    entryMorphologyGroupNotes: "Entry Morphology Notes",
    useTemplateGroupTitle: "Leave blank to use the template group title",
    morphologyOverrideHelp: "Leave blank to use table rules; filled cells override that slot.",
    morphologyRuleSyntaxHelp: "Use {} to reference the lemma; {a = e} references and replaces inside the lemma; /leftV(a,o,u) = lar; rightV(e,i,ö,ü) = ler; else = / chooses output by the nearest left or right phoneme. Empty else inserts nothing.",
    morphologySyntaxTitle: "Morphology Syntax",
    morphologySyntaxInfo: "Show morphology syntax",
    morphologySyntaxIntro: "Each cell outputs one string. Plain text is emitted as written, and {} references the current entry lemma. All {} / {X = Y} references are expanded first, then /.../ conditions are evaluated.",
    morphologySyntaxLemma: "{}: reference the lemma directly. For example, {}-ka outputs lemma-ka.",
    morphologySyntaxReplace: "{X = Y}: reference the lemma and replace the first X with Y, equivalent to {X[1] = Y}. {X[n] = Y} replaces the nth X from the left; {X[-n] = Y} replaces the nth X from the right; {X[*] = Y} replaces every X. Multiple rules locate targets only in the original lemma, never in another rule's output.",
    morphologySyntaxCondition: "/condition = output; condition = output; else = output/: checks clauses from left to right and emits the first matching output.",
    morphologySyntaxContext: "leftV(a,o,u) checks the nearest configured object to the left; rightV(e,i,ö,ü) checks the nearest configured object to the right. left(a,o,u)(n) / right(a,o,u)(n) checks the nth character to the left or right; n must be a positive integer. If the second parentheses are omitted, n defaults to 1. Because references expand first, the left side uses already generated expanded output, and the right side previews later expanded output.",
    morphologySyntaxElse: "else may be empty; an empty else inserts nothing. For debugging, use else = ! to mark a rule that did not match.",
    morphologySyntaxSpacing: "Spaces around equals signs and commas are ignored. Leading and trailing spaces inside replacement targets are trimmed.",
    morphologySyntaxExamples: "Examples: {}/leftV(a,o,u) = lar; leftV(e,i,ö,ü) = ler; else = !/. For prefixes: /rightV(a,o,u) = ka; rightV(e,i,ö,ü) = ke; else = !/{}. Character checks can use {}r/left(r) = a; left(n)(2) = b; else = !/. Explicit replacements can use {a[1] = e, a[-1] = o, n[*] = m}.",
    close: "Close",
    expand: "Expand",
    collapse: "Collapse",
    otherSettings: "Other Settings",
    settings: "Settings",
    darkMode: "Dark Mode",
    lightMode: "Light Mode",
    newEntry: "New Entry",
    quickNewEntryTooltip: "New Entry",
    insertSymbol: "Insert {symbol}",
    backendOffline: "Backend Offline",
    openViaServer: "Open Conlexicon Through Local Service",
    backendFileMessage: "This file:// page cannot call the backend API.",
    backendApiMessage: "Cannot connect to the backend API.",
    backendHint: "Start the backend, then visit http://localhost:4173/.",
    noDictionary: "No Dictionary",
    createDictionaryFirst: "Create a Dictionary First",
    emptyDictionaryBody: "The entry editor appears after a current dictionary exists. Open dictionary management to create, import, or switch dictionaries.",
    openDictionaryManager: "Open Dictionary Manager",
    searchPlaceholder: "Search lemma, definition, tags",
    allParts: "All Parts",
    noPart: "No Part",
    rootMode: "Root Mode",
    normalMode: "Normal Mode",
    expandAll: "Expand All",
    collapseAll: "Collapse All",
    advancedFilterMode: "Advanced Filter",
    exitAdvancedFilter: "Exit",
    refreshAdvancedFilter: "Refresh Advanced Filter",
    cycleAdvancedFilter: "Cycle Filter Condition",
    qualityFilterInfo: "Show quality filter help",
    qualityFilterInfoTitle: "Quality filter help",
    qualityFilterInfoBody: "Click a quality category button to switch the issue list shown on this page. Click “View in Entry List” to enable Advanced Filter and review all entries with the current category of quality issues in the entry list. Entry cards show the matching issue types below the card; hover them to see the concrete issue. Priority filters cycle between all, high, medium, and low priority. Module filters cycle between word-form, tag, IPA, etymology network, Glossed example, and other issues.",
    qualityCurrentCategory: "Current Category",
    viewQualityEntries: "View in Entry List",
    qualityEntryCount: "entries",
    sortLemmaAsc: "Lemma A-Z",
    sortLemmaDesc: "Lemma Z-A",
    sortUpdatedAsc: "Updated Oldest",
    sortUpdatedDesc: "Updated Newest",
    sortCreatedAsc: "Created Oldest",
    sortCreatedDesc: "Created Newest",
    editEntry: "Edit Entry",
    entryContextMenu: "Entry Actions",
    createDerivedEntry: "New Derived Entry",
    partialEdit: "Local Edit",
    definitions: "Definitions",
    etymology: "Etymology",
    entryNotes: "Entry Notes",
    delete: "Delete",
    lemma: "Lemma",
    pronunciation: "Pronunciation",
    autoIpa: "Auto IPA",
    tagsLabel: "Attribute Tags (first tag is part of speech)",
    definitionList: "Definition List",
    addDefinition: "Add Definition",
    etymologyInfo: "Source and Notes",
    sourceEntry: "Source Entry",
    etymologyDescription: "Description",
    dictionarySettingsEyebrow: "Current Dictionary",
    settingsNeedDictionary: "Settings are saved in the current dictionary file.",
    glossSettings: "Gloss Rendering",
    glbSmallCaps: "Render lowercase letters in \\glb as small caps",
    corpusRendering: "Rendering",
    corpusRenderPattern: "Render Objects",
    corpusRenderPatternHelp: "Leave blank to display the corresponding content verbatim as plain text, preserving line breaks without parsing Gloss syntax. Otherwise use only \\gla, \\glb, \\glc, and \\ft; each configured line becomes one output row, and multiple non-\\ft rows can align by token. Wrap an object in parentheses, such as (\\gla), to skip it when its content is missing.",
    corpusCardRendering: "Corpus Unit Cards",
    corpusUnitNameRendering: "Unit Name (Content)",
    entryExampleRendering: "Entry Examples",
    corpusCardGlossAlign: "Align multi-line Gloss in cards",
    corpusUnitGlossAlign: "Align multi-line Gloss in unit names",
    entryExampleGlossAlign: "Align multi-line Gloss in examples",
    glossFontFamily: "Rendering Font",
    glossFontSize: "Rendering Size",
    glossStyleBold: "Bold",
    glossStyleItalic: "Italic",
    glossStyleSmallCaps: "Small Caps",
    fontSerif: "Serif",
    fontSans: "Sans",
    fontMono: "Mono",
    fontSizeSmall: "Small",
    fontSizeMedium: "Medium",
    fontSizeLarge: "Large",
    invalidCorpusRenderPattern: "Render Objects may contain only \\gla, \\glb, \\glc, \\ft, parentheses around optional objects, and line breaks.",
    corpusRenderError: "Unit name rendering error",
    searchSettings: "Search",
    searchDisplay: "Display",
    save: "Save",
    fuzzySearch: "Fuzzy Matching",
    searchFields: "Search Fields",
    searchField: "Field",
    searchFieldEnabled: "Search",
    searchFieldFuzzy: "Fuzzy",
    searchFieldLemma: "Lemma",
    searchFieldPronunciation: "IPA",
    searchFieldTags: "Tags",
    searchFieldDefinitions: "Definitions",
    searchFieldExamples: "Examples",
    searchFieldNotes: "Notes",
    searchFieldEtymology: "Etymology",
    searchFieldMorphology: "Morphology",
    searchFieldMorphologyHelp: "Morphology is generated dynamically; searching it can noticeably slow large dictionaries.",
    searchNormalization: "Search normalization",
    searchNfcHelp: "Treat canonically equivalent Unicode forms as NFC",
    searchCaseFoldingHelp: "Ignore Unicode case differences",
    searchCustomRules: "Custom equivalence rules",
    searchCustomRulesHelp: "Match each line of variants as one canonical form. Longest variants take priority and rules are not applied recursively.",
    searchCanonical: "Canonical form",
    searchVariants: "Equivalent variants (one per line)",
    addSearchNormalizationRule: "Add rule",
    removeSearchNormalizationRule: "Remove rule",
    searchNormalizationInvalidRule: "The custom search rule is invalid.",
    searchNormalizationEmptyCanonical: "Enter a canonical form for the rule.",
    searchNormalizationEmptyVariants: "Enter at least one equivalent variant.",
    searchNormalizationConflictingVariant: "An equivalent variant cannot map to multiple canonical forms.",
    etymologyAutocomplete: "Etymology Autocomplete",
    sourceFuzzyHelp: "Enable fuzzy matching in etymology source completion",
    searchFieldRequired: "Enable at least one search field.",
    searchHighlightHelp: "Highlight matches while searching",
    switchEntrySettings: "Entry Switching",
    editEntrySettings: "Entry Editing",
    savePartialOnSwitch: "Handle local edits when switching pages",
    saveFullOnSwitch: "Handle full edits when switching pages",
    editSwitchSave: "Save",
    editSwitchDiscard: "Discard Changes",
    editSwitchPrompt: "Show Prompt",
    partialEditSwitchPrompt: "The current local edit has not been handled. Save it, discard it, or cancel the current action.",
    fullEditSwitchPrompt: "The current full edit has not been handled. Save it, discard it, or cancel the current action.",
    autoSaveSettings: "Auto Save",
    corpusAutoSave: "Auto-save corpus",
    docsAutoSave: "Auto-save language docs",
    allowEmptyPronunciation: "Allow saving without pronunciation",
    allowEmptyTags: "Allow saving without tags",
    allowEmptyDefinitions: "Allow saving without definitions",
    requiredPronunciation: "Fill pronunciation",
    requiredTags: "Fill at least one tag",
    requiredDefinition: "Fill at least one definition",
    unsavedSettingsConfirm: "Other Settings has unsaved changes. Save them, discard them, or cancel the current action.",
    unsavedIpaConfirm: "Auto IPA has unsaved changes. Save them, discard them, or cancel the current action.",
    unsavedDictionaryConfirm: "Dictionary settings has unsaved changes. Save them, discard them, or cancel the current action.",
    unsavedMorphologyConfirm: "Auto Morphology has unsaved changes. Save them, discard them, or cancel the current action.",
    unsavedCorpusConfirm: "Corpus has unsaved changes. Save them, discard them, or cancel the current action.",
    unsavedDocsConfirm: "Language Docs has unsaved changes. Save them, discard them, or cancel the current action.",
    tags: "Tags",
    entryTagSettings: "Entry Tags",
    tagDisplayReplacement: "Tag Display Replacement",
    tagDisplayReplacementHelp: "One per line, in the format Original Tag = Display Text. Only affects display mode; entry data is unchanged.",
    entryListRawTagDisplay: "Show raw tags in the entry list",
    entryListTagDisplayLimit: "Entry list tag display limit",
    entryListTagDisplayLimitHelp: "Set to n: entries with more than n tags show the first n-1 tags and an ellipsis. Default: 3.",
    entryListTagDisplayLimitInvalid: "Entry list tag display limit must be an integer from 2 to 10.",
    entryListPartDisplay: "Part-of-speech position in entry list",
    entryListPartDisplaySubtitle: "Subtitle",
    entryListPartDisplayChips: "Tag area",
    entryListPartDisplayBoth: "Both",
    tagTooltipRawTag: "Raw tag",
    tagTooltipDisplayReplacement: "Display",
    partOfSpeechTagSettings: "Part-of-Speech Tags",
    manualPartOfSpeechTags: "Manually configure part-of-speech tags",
    partOfSpeechTagsHelp: "When enabled, only tags listed here are recognized as parts of speech. Separate tags with commas. When disabled, the value is kept but the first entry tag is used as the part of speech.",
    tagOrderSettings: "Auto Arrange Tag Order",
    tagOrderHelp: "Enter a unified tag order separated by commas. Use raw tags, not display replacements.",
    tagOrderInfo: "Show tag ordering logic",
    tagOrderInfoBody: "After you click Refresh, each entry's tags are reordered by the unified order in this field. Tags in the unified order that an entry does not have are skipped. Tags on an entry that are not in the unified order are kept at the end, and multiple extra tags keep their original relative order. Use raw tags here; display replacements only affect how tags are shown.",
    tagOrderConfirm: "This will reorder tags for every entry in the current dictionary using the current unified order and save immediately. Continue?",
    tagOrderUnsavedSettingsConfirm: "Other Settings have unsaved changes. Save the settings before arranging tag order.",
    tagOrderApplied: "Tag order arranged",
    tagOrderEmpty: "Enter at least one tag first.",
    saveAndApply: "Save and Apply",
    applyTags: "Apply",
    tagDisplaySettings: "Tag Highlighting",
    tagRedHighlightHelp: "Configured tags are shown in red in the entry browser and display mode. Separate tags with commas, spaces, or line breaks.",
    tagFilterSettings: "Tag Filtering",
    entryListTagFilteringHelp: "Enable filtering when clicking tags in the entry list",
    displaySettings: "Display",
    polysemyDisplay: "Polysemy Display",
    entryListPolysemyDisplay: "Entry list polysemy display",
    networkPolysemyDisplay: "Lexical network hover-card polysemy display",
    emptyEntrySections: "Empty Sections",
    showEmptyEntrySections: "Show empty sections in the entry view",
    entrySectionOrder: "Entry Section Order",
    entrySectionOrderHelp: "Drag cards to reorder sections in entry display and full editing. Derived entries appear only when present and remain read-only in full editing.",
    ipaKeyboardSettings: "IPA Virtual Keyboard",
    ipaKeyboardSymbols: "Keyboard Symbols",
    ipaKeyboardHelp: "Separate symbols with spaces, commas, or line breaks. New dictionaries include ˈ and ˌ by default.",
    interfaceLayout: "Interface Layout",
    toolNavigationOrder: "Tool Navigation Order",
    toolNavigationOrderHelp: "Drag cards to reorder the left navigation. The order is saved in the current dictionary file.",
    cancel: "Cancel",
    confirm: "Confirm",
    confirmTitle: "Confirm Action",
    clear: "Clear",
    saveEntry: "Save Entry",
    dictionaryManagerEyebrow: "Multi Dictionary",
    dictionaryManager: "Dictionary Manager",
    backToEditor: "Back to Editor",
    newDictionary: "New Dictionary",
    managerNeedsBackend: "Dictionary Management Needs Backend",
    deleteDictionary: "Delete Dictionary",
    name: "Name",
    language: "Language",
    description: "Description",
    exportJson: "Export JSON",
    importJson: "Import JSON",
    saveConfig: "Save Config",
    unnamedDictionary: "Untitled Dictionary",
    dictionary: "Dictionary",
    entries: "entries",
    roots: "roots",
    noEntries: "No entries yet",
    noEntriesBody: "Create the first entry to show details here.",
    noMatch: "No matching entries",
    noMatchBody: "Create an entry, or adjust search and filters.",
    entryResultsTruncated: "Loaded {loaded} of {total} entries",
    rootGroupsTruncated: "Loaded {loaded} of {total} root groups",
    noDescription: "No description",
    config: "Configure",
    setCurrent: "Set Current",
    new: "New",
    edit: "Edit",
    entry: "Entry",
    meaning: "Definition",
    example: "Example",
    definitionNote: "Definition Note",
    addExample: "Add Example",
    addDefinitionNote: "Add Definition Note",
    removeDefinition: "Remove Definition",
    none: "None",
    wholeEntryNote: "Whole Entry Note",
    requiredEntry: "Fill lemma",
    missingDefinition: "No definition yet",
    savedEntry: "Entry saved",
    noChangesToSave: "No changes to save",
    derivedEntryDraft: "Derived entry draft created",
    deletedEntry: "Entry deleted",
    createDictionaryFirstToast: "Create a dictionary first",
    saveFailed: "Save failed",
    deleteConfirmEntry: "Delete entry",
    deleteConfirmDictionary: "Delete dictionary",
    andItsEntries: "and its",
    switchToolPlanned: "This tool is reserved for later implementation",
    dictionarySaved: "Dictionary config saved",
    dictionaryCreated: "Dictionary created",
    dictionaryDeleted: "Dictionary deleted",
    dictionarySaveFailed: "Failed to save dictionary",
    dictionaryDeleteFailed: "Failed to delete dictionary",
    dictionarySwitchFailed: "Failed to switch dictionary",
    switchedTo: "Switched to",
    imported: "Data imported",
    importFailed: "Cannot read this JSON file",
    languageSaveFailed: "Failed to save the interface language",
    themeSaveFailed: "Failed to save the interface theme",
    apiErrorRequestBodyTooLarge: "Saved content is too large",
    apiErrorInvalidJsonBody: "Request body is not valid JSON",
    apiErrorInvalidUiLanguage: "Invalid interface language value",
    apiErrorInvalidUiTheme: "Invalid interface theme value",
    apiErrorInvalidImportPayload: "Invalid import file format",
    apiErrorInvalidDictionaryId: "Invalid dictionary ID",
    apiErrorDictionaryNotFound: "Dictionary not found or already deleted",
    apiErrorDictionaryIdExists: "Dictionary ID already exists and needs overwrite confirmation",
    apiErrorDuplicateEntityIds: "The dictionary contains duplicate IDs",
    apiErrorDuplicateEntityIdsScoped: "The current save scope contains duplicate IDs",
    apiErrorInvalidEntryPayload: "Invalid entry save request",
    apiErrorEntryIdExists: "Entry ID already exists",
    apiErrorInvalidEntryUpdatesPayload: "Invalid batch entry update request",
    apiErrorEntryNotFound: "Entry not found or already deleted",
    apiErrorInvalidSettingsPayload: "Invalid settings save request",
    apiErrorInvalidDocsPayload: "Invalid language docs save request",
    apiErrorInvalidCorpusPayload: "Invalid corpus save request",
    apiErrorInvalidMorphologyPayload: "Invalid morphology save request",
    apiErrorInvalidIpaSettingsPayload: "Invalid IPA settings save request",
    apiErrorUnsupportedEntryPatchFields: "Batch entry update contains unsupported fields",
    apiErrorEntryPatchTagsInvalid: "Invalid batch tag update format",
    apiErrorEntryPatchPronunciationInvalid: "Invalid batch IPA update format",
    apiErrorSystemFilePermission: "File permission denied; cannot save",
    apiErrorSystemDiskFull: "Disk is full; cannot save",
    apiErrorSystemFileBusy: "File is busy; cannot save",
    apiErrorSystemFileMissing: "Target file is missing or was moved",
    apiErrorSystemJsonParse: "Local JSON file is damaged or cannot be parsed",
    apiErrorNetwork: "Cannot connect to the local service",
    apiErrorUnknown: "An unknown error occurred",
    importOverwriteTitle: "Dictionary ID already exists",
    importOverwriteMessage: "Dictionary ID “{id}” already exists. Importing “{name}” will overwrite the existing dictionary and all of its data.",
    importAndOverwrite: "Import and Overwrite",
    importInvalidIdTitle: "Invalid Dictionary ID",
    importInvalidIdMessage: "Dictionary ID “{id}” is invalid. Import it as a new dictionary and generate a new ID?",
    importAndRegenerateId: "Generate New ID and Import",
    updatedAt: "Updated",
    source: "Source",
    createSourceEntry: "Create Source Entry: {source}",
    derivedEntries: "Derived",
    ipaNeedDictionary: "Auto IPA rules are saved in the current dictionary file.",
    orthographyModule: "Orthography Recognition",
    orthographyStressModule: "Orthographic Stress",
    mappingRules: "Mapping Rules",
    addMapping: "Add Mapping",
    addStressMapping: "Add Stress Mapping",
    mappingRuleHelp: "Rules are tried from top to bottom. Inputs and contexts always read the original lemma; generated output is never fed into later rules. Characters consumed by an earlier rule are unavailable to later rules. Drag rules to change priority. Put ˈ in the output, or start it with ', to mark that syllable as stressed and override default stress.",
    stressMappingHelp: "Put ˈ in the output, or start it with ', to mark that syllable as stressed and override default stress.",
    syllabification: "Syllabification",
    syllableRules: "Syllabification Rules",
    ipaSyllableHelpTitle: "Syllabification Logic",
    ipaSyllableHelpInfo: "Show syllabification logic",
    ipaSyllableHelpBody: "Auto IPA runs orthographic mapping first. The mapped result is then tokenized by complex phonemes; a complex phoneme always stays as one unit for later decisions.\n\nThe system then finds syllable nuclei using vowel phonemes. Consonant strings between two vowel nuclei are assigned across the syllable boundary.\n\nPriority: complex phoneme tokenization → vowel nucleus detection → legal onset cluster check → legal coda cluster check → default midpoint split.\n\nOnset clusters assign the matching final part of the consonant string to the following syllable. Coda clusters keep the matching initial part with the preceding syllable. If no configured cluster applies, the fallback splits the intervening consonant string as close to the middle as possible.\n\nThe syllable separator only affects output display; it does not change internal units. Stress is applied after syllabification.",
    vowels: "Vowel Phonemes",
    syllableSeparator: "Syllable Separator",
    onsetClusters: "Onset Clusters",
    codaClusters: "Coda Clusters",
    complexPhonemes: "Complex Phonemes",
    defaultStressPosition: "Default Stress Position",
    stressRules: "Stress Rules",
    defaultStressHelp: "Integer. Positive counts from the start; negative counts from the end; 0 adds no default stress. Shorter words clamp to the farthest reachable syllable.",
    unstressMonosyllables: "Do not mark stress on monosyllables",
    batchIpaAll: "Rewrite All Pronunciations",
    batchIpaMissing: "Fill Missing Pronunciations",
    batchIpaAllConfirm: "Regenerate pronunciations for every entry with a lemma in the current dictionary, overwriting existing pronunciations. Continue?",
    batchIpaMissingConfirm: "Generate pronunciations for entries with a lemma and no pronunciation in the current dictionary. Continue?",
    batchIpaUnsavedSettingsConfirm: "Auto IPA settings have unsaved changes. Save the settings before batch generation.",
    saveAndGenerate: "Save and Generate",
    batchIpaUpdated: "Pronunciations updated",
    batchIpaNoMissing: "No entries with empty pronunciation in the current dictionary",
    ruleFrom: "Input",
    ruleTo: "Output",
    ruleBefore: "Before",
    ruleAfter: "After",
    reorderIpaRule: "Drag to reorder rule",
    removeRule: "Remove Rule",
    ipaSaved: "IPA config saved",
    ipaGenerated: "IPA generated",
    ipaNeedsLemma: "Fill the lemma first",
    ipaDefaultStressInvalid: "Default stress must be an integer",
    ipaSandbox: "IPA Sandbox",
    ipaSandboxInput: "Input",
    ipaSandboxMapped: "Mapping",
    ipaSandboxSyllables: "Syllabification",
    ipaSandboxFinal: "Final Output",
    docsNeedDictionary: "Language docs are saved in the current dictionary file.",
    analysisNeedDictionary: "Analytics are generated live from the current dictionary's entries, tags, etymology, IPA, and morphology config.",
    splitMode: "Split",
    editMode: "Edit",
    previewMode: "Preview",
    saveDocs: "Save Docs",
    docsSaved: "Docs saved",
    corpusNeedDictionary: "The corpus is saved in the current dictionary file.",
    saveCorpus: "Save Corpus",
    corpusSaved: "Corpus saved",
    corpusBlocks: "Blocks",
    corpusUnits: "Units",
    newCorpusBlock: "New Block",
    newCorpusUnit: "New Unit",
    corpusSearchPlaceholder: "Search blocks or units",
    noCorpusBlocks: "No corpus blocks yet",
    noCorpusUnits: "No corpus units yet",
    noCorpusSelection: "Select an item on the left, or create one.",
    corpusBlock: "Corpus Block",
    corpusLayer: "Corpus Layer",
    corpusUnit: "Corpus Unit",
    corpusBlockTitle: "Block Title",
    corpusUnitContent: "Unit Content",
    corpusTags: "Tags",
    corpusTagsHelp: "Separate with commas or line breaks.",
    corpusNotes: "Notes",
    corpusAttributes: "Attributes",
    addAttribute: "Add Attribute",
    attributeName: "Attribute Name",
    attributeValue: "Attribute Value",
    removeAttribute: "Remove Attribute",
    directUnits: "Direct Block Units",
    corpusLayers: "Layers",
    addLayer: "Add Layer",
    layerName: "Layer Name",
    speaker: "Speaker",
    modality: "Modality",
    linkedUnits: "Linked Units",
    chooseUnit: "Choose a unit",
    linkUnit: "Link Unit",
    unlink: "Unlink",
    moveUp: "Move Up",
    moveDown: "Move Down",
    deleteCorpusBlock: "Delete Block",
    deleteCorpusLayer: "Delete Layer",
    deleteCorpusUnit: "Delete Unit",
    deleteCorpusBlockConfirm: "Delete this block? Its layers will also be removed, and linked units will become orphan units.",
    deleteCorpusLayerConfirm: "Delete this layer? Linked units will become orphan units.",
    deleteCorpusUnitConfirm: "Delete this unit? It will also be unlinked from its current parent.",
    corpusParent: "Parent Link",
    corpusOrphan: "Orphan Unit",
    corpusBlockParent: "Block",
    corpusLayerParent: "Layer",
    effectiveAttributes: "Effective Attributes",
    effectiveAttributesHelp: "A unit in a layer inherits block then layer attributes; its own values take precedence. Explicit unit attributes always remain stored on that unit.",
    noEffectiveAttributes: "No effective attributes",
    attributeSourceBlock: "Block",
    attributeSourceLayer: "Layer",
    attributeSourceUnit: "Unit",
    corpusLinkMovesUnit: "Linking first removes the unit from its previous parent.",
    corpusIntegrityTitle: "Corpus integrity problems detected",
    corpusIntegrityHelp: "Manual JSON edits can create duplicate IDs, invalid links, or multiple parents. Review these items.",
    corpusMultipleParents: "Unit “{unit}” is linked to multiple parents: {parents}",
    corpusMissingUnit: "Parent “{parent}” references a missing unit: {unit}",
    corpusDuplicateLink: "Parent “{parent}” references unit “{unit}” more than once",
    corpusDuplicateEntityId: "Corpus ID “{id}” is used by multiple objects: {types}",
    duplicateEntityIdsTitle: "Duplicate IDs detected",
    duplicateEntityIdsMessage: "These IDs are used by multiple dictionary objects. Saving or importing has been stopped:\n{details}",
    entryEntity: "Entry",
    definitionEntity: "Definition",
    morphologyTableEntity: "Morphology table",
    corpusBlockFallback: "Untitled Block",
    corpusLayerFallback: "Untitled Layer",
    corpusUnitFallback: "Empty Unit",
    corpusRequiredBlockTitle: "Enter a block title",
    corpusRequiredUnitContent: "Enter unit content",
    corpusBlockStats: "{layers} layers · {units} units",
    corpusUnitParentLabel: "Parent: {parent}",
    lexicalNetwork: "Lexical Network",
    closeNetwork: "Close Network",
    lexicalNetworkLoading: "Loading lexical network",
    contentUpdating: "Updating",
    lexicalNetworkLoadFailed: "Could not load lexical network",
  },
};

i18n.zh.addExample = "添加例句";
i18n.zh.addDefinitionNote = "添加释义备注";
i18n.zh.createSourceEntry = "新建来源词条：{source}";

const elements = {
  appShell: document.querySelector("#appShell"),
  mobileAppBar: document.querySelector("#mobileAppBar"),
  mobileNavButton: document.querySelector("#mobileNavButton"),
  mobileCurrentViewLabel: document.querySelector("#mobileCurrentViewLabel"),
  mobileEntryListButton: document.querySelector("#mobileEntryListButton"),
  mobileNewEntryButton: document.querySelector("#mobileNewEntryButton"),
  mobileDrawerBackdrop: document.querySelector("#mobileDrawerBackdrop"),
  appNav: document.querySelector("#appNav"),
  navCollapseButton: document.querySelector("#navCollapseButton"),
  appTooltip: document.querySelector("#appTooltip"),
  editorView: document.querySelector("#editorView"),
  editorTopBar: document.querySelector("#editorTopBar"),
  entryBrowserToggleButton: document.querySelector("#entryBrowserToggleButton"),
  entryBrowser: document.querySelector("#entryBrowser"),
  dictionaryManagerView: document.querySelector("#dictionaryManagerView"),
  analysisView: document.querySelector("#analysisView"),
  qualityView: document.querySelector("#qualityView"),
  settingsView: document.querySelector("#settingsView"),
  docsView: document.querySelector("#docsView"),
  corpusView: document.querySelector("#corpusView"),
  morphologyFunctionsView: document.querySelector("#morphologyFunctionsView"),
  morphologyTablesView: document.querySelector("#morphologyTablesView"),
  ipaView: document.querySelector("#ipaView"),
  backToEditorButton: document.querySelector("#backToEditorButton"),
  backToEditorFromSettingsButton: document.querySelector("#backToEditorFromSettingsButton"),
  backToEditorFromAnalysisButton: document.querySelector("#backToEditorFromAnalysisButton"),
  backToEditorFromQualityButton: document.querySelector("#backToEditorFromQualityButton"),
  backToEditorFromDocsButton: document.querySelector("#backToEditorFromDocsButton"),
  backToEditorFromCorpusButton: document.querySelector("#backToEditorFromCorpusButton"),
  backToEditorFromMorphologyFunctionsButton: document.querySelector("#backToEditorFromMorphologyFunctionsButton"),
  backToEditorFromMorphologyTablesButton: document.querySelector("#backToEditorFromMorphologyTablesButton"),
  backToEditorFromIpaButton: document.querySelector("#backToEditorFromIpaButton"),
  batchIpaAllButton: document.querySelector("#batchIpaAllButton"),
  batchIpaMissingButton: document.querySelector("#batchIpaMissingButton"),
  addDictionaryButton: document.querySelector("#addDictionaryButton"),
  themeToggleButton: document.querySelector("#themeToggleButton"),
  themeToggleLabel: document.querySelector("#themeToggleLabel"),
  languageToggleButton: document.querySelector("#languageToggleButton"),
  brandEyebrow: document.querySelector("#brandEyebrow"),
  brandTitle: document.querySelector('[data-i18n="appTitle"]'),
  toolList: document.querySelector(".tool-list"),
  toolButtons: document.querySelectorAll(".tool-button"),
  toolNavOrderList: document.querySelector("#toolNavOrderList"),
  entrySectionOrderList: document.querySelector("#entrySectionOrderList"),
  dictionaryManagerList: document.querySelector("#dictionaryManagerList"),
  dictionaryMeta: document.querySelector("#dictionaryMeta"),
  dictionaryTitle: document.querySelector("#dictionaryTitle"),
  entryListUpdateFrame: document.querySelector("#entryListUpdateFrame"),
  entryListUpdateOverlay: document.querySelector("#entryListUpdateOverlay"),
  entryList: document.querySelector("#entryList"),
  searchInput: document.querySelector("#searchInput"),
  rootModeToggleButton: document.querySelector("#rootModeToggleButton"),
  expandAllRootsButton: document.querySelector("#expandAllRootsButton"),
  collapseAllRootsButton: document.querySelector("#collapseAllRootsButton"),
  advancedFilterToolbar: document.querySelector("#advancedFilterToolbar"),
  advancedFilterLabel: document.querySelector("#advancedFilterLabel"),
  advancedFilterRefreshButton: document.querySelector("#advancedFilterRefreshButton"),
  advancedFilterCycleButton: document.querySelector("#advancedFilterCycleButton"),
  advancedFilterExitButton: document.querySelector("#advancedFilterExitButton"),
  partFilter: document.querySelector("#partFilter"),
  sortSelect: document.querySelector("#sortSelect"),
  newEntryButton: document.querySelector("#newEntryButton"),
  entryListNewEntryButton: document.querySelector("#entryListNewEntryButton"),
  importInput: document.querySelector("#importInput"),
  entryDetailPanel: document.querySelector("#entryDetailPanel"),
  entryDetailUpdateOverlay: document.querySelector("#entryDetailUpdateOverlay"),
  entryDisplay: document.querySelector("#entryDisplay"),
  displayLemma: document.querySelector("#displayLemma"),
  displayPronunciation: document.querySelector("#displayPronunciation"),
  displayPart: document.querySelector("#displayPart"),
  displayTags: document.querySelector("#displayTags"),
  displayDefinitionsSection: document.querySelector("#displayDefinitionsSection"),
  displayDefinitions: document.querySelector("#displayDefinitions"),
  displayEtymologySection: document.querySelector("#displayEtymologySection"),
  displayEtymology: document.querySelector("#displayEtymology"),
  displayDerivedSection: document.querySelector("#displayDerivedSection"),
  displayDerived: document.querySelector("#displayDerived"),
  displayMorphologySection: document.querySelector("#displayMorphologySection"),
  displayMorphology: document.querySelector("#displayMorphology"),
  displayEntryNotesSection: document.querySelector("#displayEntryNotesSection"),
  displayEntryNotes: document.querySelector("#displayEntryNotes"),
  editEntryButton: document.querySelector("#editEntryButton"),
  openLexicalNetworkButton: document.querySelector("#openLexicalNetworkButton"),
  entryForm: document.querySelector("#entryForm"),
  entryId: document.querySelector("#entryId"),
  entryMode: document.querySelector("#entryMode"),
  entryFormTitle: document.querySelector("#entryFormTitle"),
  lemmaInput: document.querySelector("#lemmaInput"),
  pronunciationInput: document.querySelector("#pronunciationInput"),
  autoIpaButton: document.querySelector("#autoIpaButton"),
  ipaKeyboard: document.querySelector("#ipaKeyboard"),
  tagsInput: document.querySelector("#tagsInput"),
  entryMorphologyControls: document.querySelector("#entryMorphologyControls"),
  fullEditDerivedSection: document.querySelector("#fullEditDerivedSection"),
  fullEditDerived: document.querySelector("#fullEditDerived"),
  definitionFormList: document.querySelector("#definitionFormList"),
  addDefinitionButton: document.querySelector("#addDefinitionButton"),
  sourceEntryInput: document.querySelector("#sourceEntryInput"),
  sourceSuggestionBox: document.querySelector("#sourceSuggestionBox"),
  etymologyDescriptionInput: document.querySelector("#etymologyDescriptionInput"),
  notesInput: document.querySelector("#notesInput"),
  deleteEntryButton: document.querySelector("#deleteEntryButton"),
  clearEntryButton: document.querySelector("#clearEntryButton"),
  cancelEditButton: document.querySelector("#cancelEditButton"),
  dictionaryForm: document.querySelector("#dictionaryForm"),
  dictionaryId: document.querySelector("#dictionaryId"),
  dictionaryMode: document.querySelector("#dictionaryMode"),
  dictionaryFormTitle: document.querySelector("#dictionaryFormTitle"),
  dictionaryNameInput: document.querySelector("#dictionaryNameInput"),
  dictionaryLanguageInput: document.querySelector("#dictionaryLanguageInput"),
  dictionaryDescriptionInput: document.querySelector("#dictionaryDescriptionInput"),
  deleteDictionaryButton: document.querySelector("#deleteDictionaryButton"),
  backendNotice: document.querySelector("#backendNotice"),
  backendNoticeText: document.querySelector("#backendNoticeText"),
  managerBackendNotice: document.querySelector("#managerBackendNotice"),
  managerBackendNoticeText: document.querySelector("#managerBackendNoticeText"),
  emptyDictionaryNotice: document.querySelector("#emptyDictionaryNotice"),
  emptyCreateDictionaryButton: document.querySelector("#emptyCreateDictionaryButton"),
  settingsNoDictionaryNotice: document.querySelector("#settingsNoDictionaryNotice"),
  settingsOpenDictionaryManagerButton: document.querySelector("#settingsOpenDictionaryManagerButton"),
  settingsPanel: document.querySelector("#settingsPanel"),
  analysisNoDictionaryNotice: document.querySelector("#analysisNoDictionaryNotice"),
  analysisOpenDictionaryManagerButton: document.querySelector("#analysisOpenDictionaryManagerButton"),
  analysisPanel: document.querySelector("#analysisPanel"),
  qualityNoDictionaryNotice: document.querySelector("#qualityNoDictionaryNotice"),
  qualityOpenDictionaryManagerButton: document.querySelector("#qualityOpenDictionaryManagerButton"),
  qualityPanel: document.querySelector("#qualityPanel"),
  settingsForm: document.querySelector("#settingsForm"),
  glossStyleRows: [...document.querySelectorAll("[data-gloss-style]")],
  corpusUnitCardRenderPatternInput: document.querySelector("#corpusUnitCardRenderPatternInput"),
  corpusUnitCardGlossAlignInput: document.querySelector("#corpusUnitCardGlossAlignInput"),
  corpusUnitRenderPatternInput: document.querySelector("#corpusUnitRenderPatternInput"),
  corpusUnitGlossAlignInput: document.querySelector("#corpusUnitGlossAlignInput"),
  entryExampleRenderPatternInput: document.querySelector("#entryExampleRenderPatternInput"),
  entryExampleGlossAlignInput: document.querySelector("#entryExampleGlossAlignInput"),
  tagDisplayMapInput: document.querySelector("#tagDisplayMapInput"),
  entryListRawTagDisplayInput: document.querySelector("#entryListRawTagDisplayInput"),
  entryListTagDisplayLimitInput: document.querySelector("#entryListTagDisplayLimitInput"),
  entryListPartDisplayInput: document.querySelector("#entryListPartDisplayInput"),
  manualPartOfSpeechTagsInput: document.querySelector("#manualPartOfSpeechTagsInput"),
  partOfSpeechTagsInput: document.querySelector("#partOfSpeechTagsInput"),
  tagSortOrderInput: document.querySelector("#tagSortOrderInput"),
  applyTagSortOrderButton: document.querySelector("#applyTagSortOrderButton"),
  tagOrderInfoButton: document.querySelector("#tagOrderInfoButton"),
  tagRedHighlightInput: document.querySelector("#tagRedHighlightInput"),
  entryListTagFilteringInput: document.querySelector("#entryListTagFilteringInput"),
  entryListPolysemyInput: document.querySelector("#entryListPolysemyInput"),
  networkPolysemyInput: document.querySelector("#networkPolysemyInput"),
  showEmptyEntrySectionsInput: document.querySelector("#showEmptyEntrySectionsInput"),
  searchFieldEnabledInputs: [...document.querySelectorAll("[data-search-enabled]")],
  searchFieldFuzzyInputs: [...document.querySelectorAll("[data-search-fuzzy]")],
  searchNfcInput: document.querySelector("#searchNfcInput"),
  searchCaseFoldingInput: document.querySelector("#searchCaseFoldingInput"),
  searchNormalizationRuleList: document.querySelector("#searchNormalizationRuleList"),
  addSearchNormalizationRuleButton: document.querySelector("#addSearchNormalizationRuleButton"),
  sourceFuzzyInput: document.querySelector("#sourceFuzzyInput"),
  searchHighlightInput: document.querySelector("#searchHighlightInput"),
  savePartialOnSwitchInput: document.querySelector("#savePartialOnSwitchInput"),
  saveFullOnSwitchInput: document.querySelector("#saveFullOnSwitchInput"),
  corpusAutoSaveInput: document.querySelector("#corpusAutoSaveInput"),
  docsAutoSaveInput: document.querySelector("#docsAutoSaveInput"),
  allowEmptyPronunciationInput: document.querySelector("#allowEmptyPronunciationInput"),
  allowEmptyTagsInput: document.querySelector("#allowEmptyTagsInput"),
  allowEmptyDefinitionsInput: document.querySelector("#allowEmptyDefinitionsInput"),
  ipaKeyboardInput: document.querySelector("#ipaKeyboardInput"),
  docsNoDictionaryNotice: document.querySelector("#docsNoDictionaryNotice"),
  docsOpenDictionaryManagerButton: document.querySelector("#docsOpenDictionaryManagerButton"),
  docsPanel: document.querySelector("#docsPanel"),
  docsModeControl: document.querySelector("#docsModeControl"),
  docsMarkdownInput: document.querySelector("#docsMarkdownInput"),
  docsPreview: document.querySelector("#docsPreview"),
  saveDocsButton: document.querySelector("#saveDocsButton"),
  saveCorpusButton: document.querySelector("#saveCorpusButton"),
  corpusNoDictionaryNotice: document.querySelector("#corpusNoDictionaryNotice"),
  corpusOpenDictionaryManagerButton: document.querySelector("#corpusOpenDictionaryManagerButton"),
  corpusIntegrityPanel: document.querySelector("#corpusIntegrityPanel"),
  corpusIntegrityList: document.querySelector("#corpusIntegrityList"),
  corpusPanel: document.querySelector("#corpusPanel"),
  corpusModeControl: document.querySelector("#corpusModeControl"),
  newCorpusItemButton: document.querySelector("#newCorpusItemButton"),
  corpusSearchInput: document.querySelector("#corpusSearchInput"),
  corpusItemList: document.querySelector("#corpusItemList"),
  corpusEditor: document.querySelector("#corpusEditor"),
  morphologyFunctionsNoDictionaryNotice: document.querySelector("#morphologyFunctionsNoDictionaryNotice"),
  morphologyFunctionsOpenDictionaryManagerButton: document.querySelector("#morphologyFunctionsOpenDictionaryManagerButton"),
  morphologyFunctionsPanel: document.querySelector("#morphologyFunctionsPanel"),
  morphologyFunctionsForm: document.querySelector("#morphologyFunctionsForm"),
  morphologyTablesNoDictionaryNotice: document.querySelector("#morphologyTablesNoDictionaryNotice"),
  morphologyTablesOpenDictionaryManagerButton: document.querySelector("#morphologyTablesOpenDictionaryManagerButton"),
  morphologyTablesPanel: document.querySelector("#morphologyTablesPanel"),
  morphologyTablesForm: document.querySelector("#morphologyTablesForm"),
  morphologyLeftVObjectsInput: document.querySelector("#morphologyLeftVObjectsInput"),
  morphologyRightVObjectsInput: document.querySelector("#morphologyRightVObjectsInput"),
  morphologyTableList: document.querySelector("#morphologyTableList"),
  addMorphologyTableGroupButton: document.querySelector("#addMorphologyTableGroupButton"),
  morphologySyntaxButton: document.querySelector("#morphologySyntaxButton"),
  infoDialog: document.querySelector("#infoDialog"),
  infoDialogTitle: document.querySelector("#infoDialogTitle"),
  infoDialogBody: document.querySelector("#infoDialogBody"),
  closeInfoDialogButton: document.querySelector("#closeInfoDialogButton"),
  ipaNoDictionaryNotice: document.querySelector("#ipaNoDictionaryNotice"),
  ipaOpenDictionaryManagerButton: document.querySelector("#ipaOpenDictionaryManagerButton"),
  ipaPanel: document.querySelector("#ipaPanel"),
  ipaForm: document.querySelector("#ipaForm"),
  ipaMappingList: document.querySelector("#ipaMappingList"),
  addIpaMappingButton: document.querySelector("#addIpaMappingButton"),
  ipaSyllableHelpButton: document.querySelector("#ipaSyllableHelpButton"),
  ipaVowelsInput: document.querySelector("#ipaVowelsInput"),
  ipaSyllableSeparatorInput: document.querySelector("#ipaSyllableSeparatorInput"),
  ipaOnsetClustersInput: document.querySelector("#ipaOnsetClustersInput"),
  ipaCodaClustersInput: document.querySelector("#ipaCodaClustersInput"),
  ipaComplexPhonemesInput: document.querySelector("#ipaComplexPhonemesInput"),
  ipaDefaultStressInput: document.querySelector("#ipaDefaultStressInput"),
  ipaUnstressMonosyllablesInput: document.querySelector("#ipaUnstressMonosyllablesInput"),
  ipaSandboxInput: document.querySelector("#ipaSandboxInput"),
  ipaSandboxMapped: document.querySelector("#ipaSandboxMapped"),
  ipaSandboxSyllables: document.querySelector("#ipaSandboxSyllables"),
  ipaSandboxFinal: document.querySelector("#ipaSandboxFinal"),
  contentGrid: document.querySelector(".content-grid"),
  managerGrid: document.querySelector("#managerGrid"),
  lexicalNetworkOverlay: document.querySelector("#lexicalNetworkOverlay"),
  lexicalNetworkPanel: document.querySelector("#lexicalNetworkPanel"),
  closeLexicalNetworkButton: document.querySelector("#closeLexicalNetworkButton"),
  networkTitle: document.querySelector("#networkTitle"),
  networkSources: document.querySelector("#networkSources"),
  networkFocus: document.querySelector("#networkFocus"),
  networkDerived: document.querySelector("#networkDerived"),
  confirmDialog: document.querySelector("#confirmDialog"),
  confirmDialogTitle: document.querySelector("#confirmDialogTitle"),
  confirmDialogMessage: document.querySelector("#confirmDialogMessage"),
  confirmCancelButton: document.querySelector("#confirmCancelButton"),
  confirmAlternateButton: document.querySelector("#confirmAlternateButton"),
  confirmAcceptButton: document.querySelector("#confirmAcceptButton"),
  toast: document.querySelector("#toast"),
};

function staleContentUpdateElements(surface) {
  return surface === "detail"
    ? { frame: elements.entryDetailPanel, overlay: elements.entryDetailUpdateOverlay }
    : { frame: elements.entryListUpdateFrame, overlay: elements.entryListUpdateOverlay };
}

function syncStaleContentUpdate(surface) {
  const update = staleContentUpdates[surface];
  const { frame, overlay } = staleContentUpdateElements(surface);
  if (!update || !frame || !overlay) {
    return;
  }
  frame.classList.toggle("content-updating", update.showing);
  frame.setAttribute("aria-busy", String(update.pending));
  overlay.hidden = !update.showing;
  if (surface === "detail" && elements.entryDisplay) {
    elements.entryDisplay.inert = update.pending && update.hasStaleContent;
  }
}

function beginStaleContentUpdate(surface, hasStaleContent) {
  const update = staleContentUpdates[surface];
  if (!update) {
    return 0;
  }
  if (update.timer) {
    window.clearTimeout(update.timer);
  }
  const token = ++staleContentUpdateSequence;
  update.token = token;
  update.timer = 0;
  update.pending = true;
  update.hasStaleContent = Boolean(hasStaleContent);
  update.showing = false;
  syncStaleContentUpdate(surface);
  if (update.hasStaleContent) {
    update.timer = window.setTimeout(() => {
      if (update.token !== token || !update.pending) {
        return;
      }
      update.timer = 0;
      update.showing = true;
      syncStaleContentUpdate(surface);
    }, STALE_CONTENT_UPDATE_DELAY_MS);
  }
  return token;
}

function finishStaleContentUpdate(surface, token = null) {
  const update = staleContentUpdates[surface];
  if (!update || (token !== null && update.token !== token)) {
    return;
  }
  if (update.timer) {
    window.clearTimeout(update.timer);
  }
  update.timer = 0;
  update.pending = false;
  update.hasStaleContent = false;
  update.showing = false;
  syncStaleContentUpdate(surface);
}

function staleContentUpdateRetainsContent(surface) {
  const update = staleContentUpdates[surface];
  return Boolean(update?.pending && update.hasStaleContent);
}

function t(key) {
  return i18n[currentLanguage][key] || i18n.zh[key] || key;
}

function normalizeUiLanguage(value) {
  return value === "en" ? "en" : "zh";
}

function normalizeUiTheme(value) {
  return value === "dark" ? "dark" : "light";
}

function readCachedUiPreferences() {
  try {
    const raw = localStorage.getItem(UI_PREFERENCES_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const preferences = JSON.parse(raw);
    return {
      ...(preferences.uiTheme === "dark" || preferences.uiTheme === "light"
        ? { uiTheme: preferences.uiTheme }
        : {}),
    };
  } catch (error) {
    return {};
  }
}

function cacheUiPreferences(preferences = {}) {
  const cached = readCachedUiPreferences();
  const next = {
    uiTheme: normalizeUiTheme(preferences.uiTheme ?? cached.uiTheme ?? currentTheme),
  };
  try {
    localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    // Ignore storage failures; server-side preferences remain authoritative.
  }
}

function hydrateInitialUiPreferences() {
  const cached = readCachedUiPreferences();
  currentTheme = normalizeUiTheme(cached.uiTheme ?? currentTheme);
  state.uiTheme = currentTheme;
  document.body.classList.toggle("dark-theme", currentTheme === "dark");
}

function finishAppBoot() {
  requestAnimationFrame(() => {
    updateEntryBrowserHeight();
    document.body.classList.remove("app-booting");
    document.body.classList.add("app-boot-settling");
    requestAnimationFrame(() => {
      document.body.classList.remove("app-boot-settling");
    });
  });
}

function formatText(key, values = {}) {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    t(key),
  );
}

function closeConfirmDialog(result) {
  if (!confirmDialogResolver) {
    return;
  }
  elements.confirmDialog.hidden = true;
  elements.confirmAlternateButton.hidden = true;
  const resolver = confirmDialogResolver;
  confirmDialogResolver = null;
  resolver(result);
}

function closeInfoDialog() {
  elements.infoDialog.hidden = true;
  elements.infoDialogTitle.textContent = "";
  elements.infoDialogBody.innerHTML = "";
}

function infoDialogTextHtml(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function morphologySyntaxInfoHtml() {
  return `
    <div class="syntax-help">
      <p>${escapeHtml(t("morphologySyntaxIntro"))}</p>
      <ul>
        <li>${escapeHtml(t("morphologySyntaxLemma"))}</li>
        <li>${escapeHtml(t("morphologySyntaxReplace"))}</li>
        <li>${escapeHtml(t("morphologySyntaxCondition"))}</li>
        <li>${escapeHtml(t("morphologySyntaxContext"))}</li>
        <li>${escapeHtml(t("morphologySyntaxElse"))}</li>
        <li>${escapeHtml(t("morphologySyntaxSpacing"))}</li>
      </ul>
      <p>${escapeHtml(t("morphologySyntaxExamples"))}</p>
    </div>
  `;
}

function appInfoDialog(title, options = {}) {
  elements.infoDialogTitle.textContent = title;
  elements.infoDialogBody.innerHTML = options.html || infoDialogTextHtml(options.text);
  elements.infoDialog.hidden = false;
  elements.closeInfoDialogButton.focus();
}

function appConfirm(message, options = {}) {
  return new Promise((resolve) => {
    if (confirmDialogResolver) {
      closeConfirmDialog(false);
    }
    confirmDialogResolver = resolve;
    elements.confirmDialogTitle.textContent = options.title || t("confirmTitle");
    elements.confirmDialogMessage.textContent = message;
    elements.confirmCancelButton.textContent = options.cancelText || t("cancel");
    elements.confirmAlternateButton.hidden = true;
    elements.confirmAcceptButton.textContent = options.confirmText || t("confirm");
    elements.confirmCancelButton.hidden = Boolean(options.alert);
    confirmDialogResults = { cancel: false, alternate: false, accept: true };
    elements.confirmAcceptButton.classList.toggle("danger-button", Boolean(options.danger));
    elements.confirmAcceptButton.classList.toggle("primary-button", !options.danger);
    elements.confirmDialog.hidden = false;
    elements.confirmAcceptButton.focus();
  });
}

function appEditSwitchPrompt(message) {
  return new Promise((resolve) => {
    if (confirmDialogResolver) {
      closeConfirmDialog(false);
    }
    confirmDialogResolver = resolve;
    confirmDialogResults = { cancel: "cancel", alternate: "discard", accept: "save" };
    elements.confirmDialogTitle.textContent = t("confirmTitle");
    elements.confirmDialogMessage.textContent = message;
    elements.confirmCancelButton.textContent = t("cancel");
    elements.confirmCancelButton.hidden = false;
    elements.confirmAlternateButton.textContent = t("editSwitchDiscard");
    elements.confirmAlternateButton.hidden = false;
    elements.confirmAcceptButton.textContent = t("editSwitchSave");
    elements.confirmAcceptButton.classList.remove("danger-button");
    elements.confirmAcceptButton.classList.add("primary-button");
    elements.confirmDialog.hidden = false;
    elements.confirmAcceptButton.focus();
  });
}

const API_ERROR_TOAST_KEYS = {
  request_body_too_large: "apiErrorRequestBodyTooLarge",
  invalid_json_body: "apiErrorInvalidJsonBody",
  invalid_ui_language: "apiErrorInvalidUiLanguage",
  invalid_ui_theme: "apiErrorInvalidUiTheme",
  invalid_import_payload: "apiErrorInvalidImportPayload",
  invalid_dictionary_id: "apiErrorInvalidDictionaryId",
  dictionary_not_found: "apiErrorDictionaryNotFound",
  dictionary_id_exists: "apiErrorDictionaryIdExists",
  duplicate_entity_ids: "apiErrorDuplicateEntityIds",
  duplicate_entity_ids_scoped: "apiErrorDuplicateEntityIdsScoped",
  invalid_entry_payload: "apiErrorInvalidEntryPayload",
  entry_id_exists: "apiErrorEntryIdExists",
  invalid_entry_updates_payload: "apiErrorInvalidEntryUpdatesPayload",
  entry_not_found: "apiErrorEntryNotFound",
  invalid_settings_payload: "apiErrorInvalidSettingsPayload",
  invalid_docs_payload: "apiErrorInvalidDocsPayload",
  invalid_corpus_payload: "apiErrorInvalidCorpusPayload",
  invalid_morphology_payload: "apiErrorInvalidMorphologyPayload",
  invalid_ipa_settings_payload: "apiErrorInvalidIpaSettingsPayload",
  unsupported_entry_patch_fields: "apiErrorUnsupportedEntryPatchFields",
  entry_patch_tags_invalid: "apiErrorEntryPatchTagsInvalid",
  entry_patch_pronunciation_invalid: "apiErrorEntryPatchPronunciationInvalid",
  system_file_permission: "apiErrorSystemFilePermission",
  system_disk_full: "apiErrorSystemDiskFull",
  system_file_busy: "apiErrorSystemFileBusy",
  system_file_missing: "apiErrorSystemFileMissing",
  system_json_parse: "apiErrorSystemJsonParse",
  unknown_error: "apiErrorUnknown",
};

function apiErrorToastMessage(error, fallbackKey = "saveFailed") {
  const key = API_ERROR_TOAST_KEYS[error?.code] || (error instanceof TypeError ? "apiErrorNetwork" : "");
  const detail = key ? t(key) : "";
  if (!detail) {
    return t(fallbackKey);
  }
  return `${t(fallbackKey)}：${detail}`;
}

function showApiErrorToast(error, fallbackKey = "saveFailed") {
  showToast(apiErrorToastMessage(error, fallbackKey));
  console.error(error);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (error) {
      payload = null;
    }
    const apiError = new Error(payload?.error?.message || text || `HTTP ${response.status}`);
    apiError.status = response.status;
    apiError.code = payload?.error?.code || "";
    apiError.details = payload?.error?.details;
    throw apiError;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function loadState() {
  try {
    const serverState = await api("/api/state");
    backendAvailable = true;
    backendMessage = "";
    currentLanguage = normalizeUiLanguage(serverState.uiLanguage);
    currentTheme = normalizeUiTheme(serverState.uiTheme);
    cacheUiPreferences({ uiTheme: currentTheme });
    await applyServerState({
      ...serverState,
      selectedEntryId: state.selectedEntryId,
      selectedDictionaryConfigId: state.selectedDictionaryConfigId || serverState.activeDictionaryId,
      activeView: state.activeView,
    });
  } catch (error) {
    backendAvailable = false;
    backendMessage = location.protocol === "file:" ? t("backendFileMessage") : t("backendApiMessage");
    console.error(error);
  }

  render();
  finishAppBoot();
}

function normalizeDictionarySummary(summary) {
  if (!summary || typeof summary !== "object") {
    return null;
  }
  const entryCount = Number(summary.entryCount);
  const rootCount = Number(summary.rootCount);
  return {
    entryCount: Number.isFinite(entryCount) && entryCount >= 0 ? entryCount : null,
    rootCount: Number.isFinite(rootCount) && rootCount >= 0 ? rootCount : null,
  };
}

function mergeDictionaryMetadataSnapshot(previous, metadata) {
  return {
    ...previous,
    id: metadata.id,
    name: metadata.name,
    language: metadata.language,
    description: metadata.description,
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
    summary: metadata.summary || previous.summary || null,
  };
}

async function fetchDictionarySnapshot(dictionaryId) {
  return api(`/api/dictionaries/${encodeURIComponent(dictionaryId)}`);
}

async function ensureDictionarySnapshotLoaded(dictionaryId) {
  if (!dictionaryId || loadedDictionaryIds.has(dictionaryId)) {
    return null;
  }
  const snapshot = await fetchDictionarySnapshot(dictionaryId);
  const normalized = replaceDictionaryInState(snapshot);
  loadedDictionaryIds.add(normalized.id);
  return normalized;
}

async function applyServerState(source) {
  const previousDictionaryIds = new Set(state.dictionaries.map((dictionary) => dictionary.id));
  const previousLoadedById = new Map(
    state.dictionaries
      .filter((dictionary) => loadedDictionaryIds.has(dictionary.id))
      .map((dictionary) => [dictionary.id, dictionary]),
  );
  const normalizedState = normalizeState(source);
  const nextLoadedDictionaryIds = new Set();
  const nextDictionaryIds = new Set(normalizedState.dictionaries.map((dictionary) => dictionary.id));

  previousDictionaryIds.forEach((dictionaryId) => {
    if (!nextDictionaryIds.has(dictionaryId)) {
      invalidateDictionaryQueryCache(dictionaryId);
    }
  });

  normalizedState.dictionaries = normalizedState.dictionaries.map((dictionary) => {
    const previous = previousLoadedById.get(dictionary.id);
    if (previous && previous.updatedAt === dictionary.updatedAt) {
      nextLoadedDictionaryIds.add(dictionary.id);
      return mergeDictionaryMetadataSnapshot(previous, dictionary);
    }
    if (previous) {
      invalidateDictionaryQueryCache(dictionary.id);
    }

    return dictionary;
  });

  state = normalizedState;
  loadedDictionaryIds = nextLoadedDictionaryIds;
  await ensureDictionarySnapshotLoaded(state.activeDictionaryId);
}

function normalizeState(source) {
  return {
    activeDictionaryId: source.activeDictionaryId || "",
    selectedEntryId: source.selectedEntryId || "",
    selectedDictionaryConfigId: source.selectedDictionaryConfigId || source.activeDictionaryId || "",
    activeView: source.activeView || "editor",
    uiLanguage: normalizeUiLanguage(source.uiLanguage),
    uiTheme: normalizeUiTheme(source.uiTheme),
    dictionaries: Array.isArray(source.dictionaries) ? source.dictionaries.map(normalizeDictionaryMetadata) : [],
  };
}

function normalizeDictionaryMetadata(dictionary = {}) {
  return {
    id: String(dictionary.id || "").trim(),
    name: String(dictionary.name || t("unnamedDictionary")),
    language: String(dictionary.language || ""),
    description: String(dictionary.description || ""),
    createdAt: String(dictionary.createdAt || ""),
    updatedAt: String(dictionary.updatedAt || ""),
    summary: normalizeDictionarySummary(dictionary.summary),
  };
}

function normalizeDictionary(dictionary) {
  const usedEntityIds = new Set(dictionaryEntityIdRecords(dictionary).map(({ id }) => id));
  const entries = Array.isArray(dictionary.entries)
    ? dictionary.entries.map((entry) => normalizeEntry({
      ...entry,
      id: reserveEntityId(entry.id, "entry", usedEntityIds),
    }, usedEntityIds))
    : [];
  return {
    id: dictionary.id || uid("dict"),
    name: dictionary.name || t("unnamedDictionary"),
    language: dictionary.language || "",
    description: dictionary.description || "",
    settings: normalizeDictionarySettings(dictionary.settings, usedEntityIds),
    docs: normalizeDocs(dictionary.docs),
    corpus: normalizeCorpus(dictionary.corpus, usedEntityIds),
    morphology: normalizeMorphology(dictionary.morphology, usedEntityIds),
    createdAt: dictionary.createdAt || new Date().toISOString(),
    updatedAt: dictionary.updatedAt || new Date().toISOString(),
    summary: normalizeDictionarySummary(dictionary.summary),
    entries,
  };
}

function normalizeEntry(entry, usedIds = new Set()) {
  const tags = Array.isArray(entry.tags) ? entry.tags.filter(Boolean) : [];

  const definitions = Array.isArray(entry.definitions)
    ? entry.definitions.map((definition) => normalizeDefinition(definition, usedIds))
    : [];

  const sources = Array.isArray(entry.etymology?.sources)
    ? entry.etymology.sources.map(String).map((item) => item.trim()).filter(Boolean)
    : [];

  const morphologyState = morphologyModel.normalizeEntryMorphologyState(entry, { usedIds, reserveEntityId });
  return {
    id: entry.id || uid("entry"),
    lemma: entry.lemma || "",
    pronunciation: entry.pronunciation || "",
    tags,
    definitions,
    etymology: {
      sources,
      description: entry.etymology?.description || "",
    },
    notes: entry.notes || "",
    // `morphology` is a temporary view-model adapter for the old editor UI.
    // Persistence and all shared calculations use the canonical state below.
    morphologyMode: morphologyState.morphologyMode,
    morphologyGroups: morphologyState.morphologyGroups,
    morphology: morphologyEditorView(morphologyState),
    createdAt: entry.createdAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || new Date().toISOString(),
  };
}

function normalizeDefinition(definition = {}, usedIds = new Set()) {
  return {
    id: reserveEntityId(definition.id, "def", usedIds),
    meaning: definition.meaning || "",
    example: definition.example || "",
    note: definition.note || "",
  };
}

function normalizeDictionarySettings(settings = {}, usedIds = new Set()) {
  const search = entrySearchModel.normalizeEntrySearchSettings(settings.search);
  return {
    ...settings,
    glossStyles: normalizeGlossStyles(settings.glossStyles),
    corpusUnitCardRenderPattern: String(settings.corpusUnitCardRenderPattern ?? settings.corpusUnitRenderPattern ?? ""),
    corpusUnitCardGlossAlign: Boolean(settings.corpusUnitCardGlossAlign ?? true),
    corpusUnitRenderPattern: String(settings.corpusUnitRenderPattern || ""),
    corpusUnitGlossAlign: Boolean(settings.corpusUnitGlossAlign ?? true),
    entryExampleRenderPattern: String(settings.entryExampleRenderPattern ?? DEFAULT_ENTRY_EXAMPLE_RENDER_PATTERN),
    entryExampleGlossAlign: Boolean(settings.entryExampleGlossAlign ?? true),
    corpusAutoSave: Boolean(settings.corpusAutoSave ?? true),
    docsAutoSave: Boolean(settings.docsAutoSave ?? true),
    tagDisplayMap: normalizeTagDisplayMap(settings.tagDisplayMap),
    entryListRawTagDisplay: Boolean(settings.entryListRawTagDisplay),
    entryListTagDisplayLimit: normalizeEntryListTagDisplayLimit(settings.entryListTagDisplayLimit),
    entryListPartDisplay: normalizeEntryListPartDisplay(settings.entryListPartDisplay),
    manualPartOfSpeechTags: Boolean(settings.manualPartOfSpeechTags),
    partOfSpeechTags: normalizeTagList(settings.partOfSpeechTags),
    tagSortOrder: normalizeTagList(settings.tagSortOrder),
    redHighlightTags: normalizeRedHighlightTags(settings.redHighlightTags),
    entryListTagFiltering: Boolean(settings.entryListTagFiltering ?? true),
    entryListPolysemyDisplay: Boolean(settings.entryListPolysemyDisplay),
    networkPolysemyDisplay: Boolean(settings.networkPolysemyDisplay),
    showEmptyEntrySections: Boolean(settings.showEmptyEntrySections),
    entrySectionOrder: normalizeEntrySectionOrder(settings.entrySectionOrder),
    search,
    searchHighlight: Boolean(settings.searchHighlight ?? true),
    partialEditPageSwitchAction: normalizeEditPageSwitchAction(settings.partialEditPageSwitchAction),
    fullEditPageSwitchAction: normalizeEditPageSwitchAction(settings.fullEditPageSwitchAction),
    allowEmptyPronunciation: Boolean(settings.allowEmptyPronunciation ?? true),
    allowEmptyTags: Boolean(settings.allowEmptyTags ?? true),
    allowEmptyDefinitions: Boolean(settings.allowEmptyDefinitions ?? true),
    ipaKeyboard: normalizeIpaKeyboard(settings.ipaKeyboard),
    ipa: normalizeIpaSettings(settings.ipa),
    toolNavOrder: normalizeToolNavOrder(settings.toolNavOrder),
  };
}

let entrySearchRuntimeCache = { dictionary: null, search: null, options: null };

function entrySearchQueryOptions(dictionary = activeDictionary()) {
  const search = dictionary?.settings?.search;
  if (entrySearchRuntimeCache.dictionary === dictionary
    && entrySearchRuntimeCache.search === search
    && entrySearchRuntimeCache.options) {
    return entrySearchRuntimeCache.options;
  }
  const normalizedSearch = entrySearchModel.normalizeEntrySearchSettings(search);
  const options = entrySearchModel.searchSettingsQueryOptions(normalizedSearch);
  entrySearchRuntimeCache = { dictionary, search, options };
  return options;
}

function normalizeEntrySearchText(value, dictionary = activeDictionary()) {
  return entrySearchQueryOptions(dictionary).normalizeText(value);
}

function entrySearchQuerySignature(dictionary = activeDictionary()) {
  const { fields, fuzzyFields, normalization } = entrySearchQueryOptions(dictionary);
  return [
    [...fields].join(","),
    [...fuzzyFields].join(","),
    stableJson(normalization),
  ].join("|");
}

function normalizeEditPageSwitchAction(value) {
  return ["save", "discard", "prompt"].includes(value)
    ? value
    : "discard";
}

function normalizeGlossFontFamily(value) {
  return ["serif", "sans", "mono"].includes(value) ? value : "serif";
}

function normalizeGlossFontSize(value) {
  return ["small", "medium", "large"].includes(value) ? value : "medium";
}

function normalizeGlossStyles(styles = {}) {
  const fallbackFont = normalizeGlossFontFamily("serif");
  return Object.fromEntries(GLOSS_STYLE_KEYS.map((key) => {
    const style = styles?.[key] && typeof styles[key] === "object" ? styles[key] : {};
    return [key, {
      fontFamily: normalizeGlossFontFamily(style.fontFamily || fallbackFont),
      fontSize: normalizeGlossFontSize(style.fontSize),
      bold: Boolean(style.bold),
      italic: Boolean(style.italic ?? (key === "ft")),
      ...(key === "glb" ? { smallCaps: Boolean(style.smallCaps) } : {}),
    }];
  }));
}

function normalizeToolNavOrder(order = []) {
  const source = Array.isArray(order) ? order : [];
  const result = [];
  source.forEach((item) => {
    const view = String(item || "").trim();
    if (DEFAULT_TOOL_NAV_ORDER.includes(view) && !result.includes(view)) {
      result.push(view);
    }
  });
  DEFAULT_TOOL_NAV_ORDER.forEach((view) => {
    if (!result.includes(view)) {
      result.push(view);
    }
  });
  return result;
}

function normalizeEntrySectionOrder(order = []) {
  const source = Array.isArray(order) ? order : [];
  const result = [];
  source.forEach((item) => {
    const section = String(item || "").trim();
    if (DEFAULT_ENTRY_SECTION_ORDER.includes(section) && !result.includes(section)) {
      result.push(section);
    }
  });
  DEFAULT_ENTRY_SECTION_ORDER.forEach((section) => {
    if (!result.includes(section)) {
      result.push(section);
    }
  });
  return result;
}

function normalizeEntryListPartDisplay(value) {
  return ENTRY_LIST_PART_DISPLAY_OPTIONS.includes(value) ? value : "subtitle";
}

function entrySectionLabel(section) {
  const labels = {
    definitions: t("definitions"),
    etymology: t("etymology"),
    derived: t("derivedEntries"),
    morphology: t("morphologyDisplay"),
    notes: t("entryNotes"),
  };
  return labels[section] || section;
}

function toolNavLabel(view) {
  const labels = {
    editor: t("entryEditor"),
    docs: t("languageDocs"),
    corpus: t("corpus"),
    analysis: t("analysis"),
    quality: t("qualityCheck"),
    ipa: t("ipaConfig"),
    "morphology-functions": t("morphologyFunctions"),
    "morphology-tables": t("morphologyTables"),
    settings: t("otherSettings"),
    manager: t("dictionaryManager"),
  };
  return labels[view] || view;
}

function normalizeTagDisplayMap(map = {}) {
  return tagModel.normalizeTagDisplayMap(map);
}

function normalizeRedHighlightTags(value) {
  return tagModel.normalizeRedHighlightTags(value);
}

function normalizeTagList(value) {
  return tagModel.normalizeTagList(value);
}

function normalizeEntryListTagDisplayLimit(value) {
  return tagModel.normalizeEntryListTagDisplayLimit(value);
}

function entryListTagDisplayLimitInputIsValid() {
  const raw = elements.entryListTagDisplayLimitInput.value.trim();
  if (!raw) {
    return true;
  }
  if (!/^\d+$/.test(raw)) {
    return false;
  }
  const value = Number.parseInt(raw, 10);
  return value >= MIN_ENTRY_LIST_TAG_DISPLAY_LIMIT && value <= MAX_ENTRY_LIST_TAG_DISPLAY_LIMIT;
}

function tagOrderRankMap(order) {
  const ranks = new Map();
  normalizeTagList(order).forEach((tag, index) => {
    const key = normalize(tag);
    if (key && !ranks.has(key)) {
      ranks.set(key, index);
    }
  });
  return ranks;
}

function arrangeTagsByOrder(tags = [], order = []) {
  const items = (tags || []).filter(Boolean);
  const ranks = tagOrderRankMap(order);
  if (!ranks.size || items.length < 2) {
    return items;
  }
  return items
    .map((tag, index) => ({
      tag,
      index,
      rank: ranks.has(normalize(tag)) ? ranks.get(normalize(tag)) : Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ tag }) => tag);
}

function parseTagDisplayMap(value) {
  const map = {};
  String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const match = line.match(/^(.+?)(?:\s*=\s*|\s*:\s*|\t+)(.+)$/);
      if (!match) {
        return;
      }
      const key = match[1].trim();
      const replacement = match[2].trim();
      if (key && replacement) {
        map[key] = replacement;
      }
    });
  return map;
}

function serializeTagDisplayMap(map = {}) {
  return Object.entries(normalizeTagDisplayMap(map))
    .map(([key, value]) => `${key} = ${value}`)
    .join("\n");
}

function normalizeDocs(docs = {}) {
  return {
    markdown: String(docs.markdown || ""),
  };
}

function normalizeCorpus(corpus = {}, usedIds = null) {
  const reservedIds = usedIds || new Set(corpusEntityIdRecords(corpus).map(({ id }) => id));
  return {
    ...corpus,
    blocks: Array.isArray(corpus.blocks) ? corpus.blocks.map((block) => normalizeCorpusBlock(block, reservedIds)) : [],
    units: Array.isArray(corpus.units) ? corpus.units.map((unit) => normalizeCorpusUnit(unit, reservedIds)) : [],
  };
}

function normalizeCorpusBlock(block = {}, usedIds = new Set()) {
  const now = new Date().toISOString();
  return {
    ...block,
    id: reserveEntityId(block.id, "corpus-block", usedIds),
    title: String(block.title || ""),
    attributes: normalizeCorpusAttributes(block.attributes),
    tags: uniqueList(block.tags),
    notes: String(block.notes || ""),
    unitIds: normalizeCorpusUnitIds(block.unitIds),
    layers: Array.isArray(block.layers) ? block.layers.map((layer) => normalizeCorpusLayer(layer, usedIds)) : [],
    createdAt: block.createdAt || now,
    updatedAt: block.updatedAt || now,
  };
}

function normalizeCorpusLayer(layer = {}, usedIds = new Set()) {
  return {
    ...layer,
    id: reserveEntityId(layer.id, "corpus-layer", usedIds),
    name: String(layer.name || ""),
    speaker: String(layer.speaker || ""),
    modality: String(layer.modality || ""),
    attributes: normalizeCorpusAttributes(layer.attributes),
    tags: uniqueList(layer.tags),
    notes: String(layer.notes || ""),
    unitIds: normalizeCorpusUnitIds(layer.unitIds),
  };
}

function normalizeCorpusUnit(unit = {}, usedIds = new Set()) {
  const now = new Date().toISOString();
  return {
    ...unit,
    id: reserveEntityId(unit.id, "corpus-unit", usedIds),
    content: String(unit.content || ""),
    attributes: normalizeCorpusAttributes(unit.attributes),
    tags: uniqueList(unit.tags),
    notes: String(unit.notes || ""),
    createdAt: unit.createdAt || now,
    updatedAt: unit.updatedAt || now,
  };
}

function normalizeCorpusAttributes(attributes = {}) {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(attributes)
      .map(([key, value]) => [String(key).trim(), String(value ?? "")])
      .filter(([key]) => key),
  );
}

function normalizeCorpusUnitIds(unitIds = []) {
  return Array.isArray(unitIds)
    ? unitIds.map((unitId) => String(unitId || "").trim()).filter(Boolean)
    : [];
}

function normalizeMorphology(morphology = {}, usedIds = new Set()) {
  const normalized = morphologyModel.normalizeMorphology(morphology, {
    usedIds,
    reserveEntityId,
    defaultGroupName: t("morphologyTable"),
    defaultTableTitle: t("morphologyTable"),
  });
  return {
    ...normalized,
    // The old table editor remains a temporary UI adapter until the dedicated
    // morphology-table page is migrated in a later step.
    tables: legacyMorphologyTableViews(normalized.templateGroups),
  };
}

function normalizeMorphologyFunctions(functions = {}) {
  return morphologyModel.normalizeMorphologyFunctions(functions);
}

function normalizeMorphologyCell(cell = {}) {
  return {
    mode: "reference",
    value: String(cell?.value ?? cell?.sourceText ?? ""),
  };
}

function normalizeMorphologyOverrides(overrides = {}) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return {};
  }
  return Object.fromEntries(Object.entries(overrides)
    .map(([key, value]) => [key, String(value || "").trim()])
    .filter(([key, value]) => /^(\d+),(\d+)$/.test(key) && value));
}

function legacyMorphologyTableViews(templateGroups = []) {
  return (templateGroups || []).flatMap((group) => (group.tables || []).map((table, tableIndex) => {
    const cells = {};
    Object.entries(table.cells || {}).forEach(([key, cell]) => {
      cells[key] = normalizeMorphologyCell(cell);
    });
    return {
      // The existing UI identifies the first table in a group by group ID.
      // This adapter is deleted with the old single-table editor.
      id: tableIndex === 0 ? group.id : table.id,
      templateGroupId: group.id,
      templateTableId: table.id,
      name: table.title || group.name || t("morphologyTable"),
      rows: table.rowCount,
      cols: table.columnCount,
      rowLabels: table.rowLabels || [],
      colLabels: table.columnLabels || [],
      matchTags: group.matchTags || [],
      cells,
    };
  }));
}

function morphologyEditorView({ morphologyMode = "auto", morphologyGroups = [] } = {}) {
  const explicitGroup = morphologyMode === "manual" ? morphologyGroups[0] : null;
  const sourceGroups = explicitGroup ? [explicitGroup] : morphologyGroups;
  if (explicitGroup?.templateGroupId) {
    const overrides = {};
    Object.values(explicitGroup.overrides || {}).forEach((cellMap) => {
      Object.entries(cellMap || {}).forEach(([key, value]) => {
        if (!overrides[key] && String(value || "").trim()) {
          overrides[key] = String(value);
        }
      });
    });
    return { tableId: explicitGroup.templateGroupId, overrides };
  }
  const overrides = {};
  sourceGroups.forEach((group) => Object.values(group.overrides || {}).forEach((cellMap) => {
    Object.entries(cellMap || {}).forEach(([key, value]) => {
      if (!overrides[key] && String(value || "").trim()) {
        overrides[key] = String(value);
      }
    });
  }));
  return {
    tableId: "auto",
    overrides,
  };
}

function morphologyCellKey(row, col) {
  return morphologyModel.morphologyCellKey(row, col);
}

function normalizeIpaKeyboard(symbols) {
  return ipaModel.normalizeIpaKeyboard(symbols);
}

function splitKeyboardSymbols(value) {
  return ipaModel.splitKeyboardSymbols(value);
}

function normalizeIpaSettings(ipa = {}) {
  return ipaModel.normalizeIpaSettings(ipa);
}

function normalizeClusterList(value) {
  return ipaModel.normalizeClusterList(value);
}

function normalizeOnsetClusters(value) {
  return ipaModel.normalizeOnsetClusters(value);
}

function hasStressOutput(value) {
  return ipaModel.hasStressOutput(value);
}

function normalizeIpaRuleList(rules, usedIds = new Set()) {
  return ipaModel.normalizeIpaRuleList(rules, { usedIds, reserveEntityId });
}

function normalizeIpaRule(rule = {}, usedIds = new Set()) {
  return ipaModel.normalizeIpaRule(rule, { usedIds, reserveEntityId });
}

function uid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function reserveEntityId(value, prefix, usedIds) {
  const existing = String(value || "").trim();
  if (existing) {
    usedIds.add(existing);
    return existing;
  }
  let id = uid(prefix);
  while (usedIds.has(id)) {
    id = uid(prefix);
  }
  usedIds.add(id);
  return id;
}

function corpusEntityIdRecords(corpus = {}) {
  const records = [];
  (corpus.blocks || []).forEach((block) => {
    records.push({ id: String(block.id || "").trim(), typeKey: "corpusBlock" });
    (block.layers || []).forEach((layer) => {
      records.push({ id: String(layer.id || "").trim(), typeKey: "corpusLayer" });
    });
  });
  (corpus.units || []).forEach((unit) => {
    records.push({ id: String(unit.id || "").trim(), typeKey: "corpusUnit" });
  });
  return records.filter((record) => record.id);
}

function dictionaryEntityIdRecords(dictionary = {}) {
  const records = [];
  (dictionary.entries || []).forEach((entry) => {
    records.push({
      id: String(entry.id || "").trim(),
      typeKey: "entryEntity",
    });
    (entry.definitions || []).forEach((definition) => {
      records.push({
        id: String(definition.id || "").trim(),
        typeKey: "definitionEntity",
      });
    });
  });
  (dictionary.morphology?.templateGroups || []).forEach((group) => {
    records.push({
      id: String(group.id || "").trim(),
      typeKey: "morphologyTableEntity",
    });
    (group.tables || []).forEach((table) => {
      records.push({
        id: String(table.id || "").trim(),
        typeKey: "morphologyTableEntity",
      });
    });
  });
  records.push(...corpusEntityIdRecords(dictionary.corpus));
  return records.filter((record) => record.id);
}

function duplicateEntityIdGroups(records) {
  const recordsById = new Map();
  records.forEach((record) => {
    if (!recordsById.has(record.id)) {
      recordsById.set(record.id, []);
    }
    recordsById.get(record.id).push(record);
  });
  return [...recordsById.entries()]
    .filter(([, matches]) => matches.length > 1)
    .map(([id, matches]) => ({ id, matches }));
}

function duplicateDictionaryEntityIds(dictionary = {}) {
  return duplicateEntityIdGroups(dictionaryEntityIdRecords(dictionary));
}

function uniqueDictionaryEntityId(prefix, dictionary = activeDictionary()) {
  const usedIds = new Set(dictionaryEntityIdRecords(dictionary).map((record) => record.id));
  let id = uid(prefix);
  while (usedIds.has(id)) {
    id = uid(prefix);
  }
  return id;
}

function validateDictionaryEntityIds(dictionary = {}) {
  const duplicates = duplicateDictionaryEntityIds(dictionary);
  if (!duplicates.length) {
    lastDuplicateEntityIdAlert = "";
    return true;
  }
  const signature = stableJson(duplicates.map(({ id, matches }) => [id, matches.map(({ typeKey }) => typeKey)]));
  if (signature !== lastDuplicateEntityIdAlert) {
    lastDuplicateEntityIdAlert = signature;
    const details = duplicates.map(({ id, matches }) => {
      const types = [...new Set(matches.map(({ typeKey }) => t(typeKey)))].join(", ");
      return `${id} (${types})`;
    }).join("\n");
    appConfirm(formatText("duplicateEntityIdsMessage", { details }), {
      title: t("duplicateEntityIdsTitle"),
      alert: true,
    });
  }
  return false;
}

function activeDictionary() {
  return state.dictionaries.find((dictionary) => dictionary.id === state.activeDictionaryId) || null;
}

function selectedEntry() {
  const dictionary = activeDictionary();
  if (
    !dictionary
    || !state.selectedEntryId
    || selectedEntryDetailState.dictionaryId !== dictionary.id
    || selectedEntryDetailState.entryId !== state.selectedEntryId
    || selectedEntryDetailState.status !== "success"
  ) {
    return null;
  }
  return selectedEntryDetailState.entry;
}

function entryDetailCacheKey(dictionaryId, entryId) {
  return `entry-detail\u0000${dictionaryId}\u0000${entryId}`;
}

function resetSelectedEntryDetailState() {
  finishStaleContentUpdate("detail");
  entryDetailHasSettledContent = false;
  selectedEntryDetailLoadPromise = null;
  selectedEntryDetailState = {
    dictionaryId: "",
    entryId: "",
    status: "idle",
    entry: null,
    staleEntry: null,
    error: null,
    requestId: selectedEntryDetailState.requestId + 1,
  };
}

function cacheSavedEntryDetail(dictionaryId, entry) {
  if (!dictionaryId || !entry?.id) {
    return;
  }
  entryDetailCache.set(entryDetailCacheKey(dictionaryId, entry.id), entry, { dictionaryId });
  if (state.activeDictionaryId === dictionaryId && state.selectedEntryId === entry.id) {
    selectedEntryDetailState = {
      dictionaryId,
      entryId: entry.id,
      status: "success",
      entry,
      staleEntry: null,
      error: null,
      requestId: selectedEntryDetailState.requestId + 1,
    };
    finishStaleContentUpdate("detail");
  }
}

async function ensureSelectedEntryDetailLoaded() {
  const dictionary = activeDictionary();
  const entryId = state.selectedEntryId;
  if (!dictionary || !entryId) {
    resetSelectedEntryDetailState();
    return null;
  }
  if (
    selectedEntryDetailState.dictionaryId === dictionary.id
    && selectedEntryDetailState.entryId === entryId
    && selectedEntryDetailState.status === "success"
  ) {
    return selectedEntryDetailState.entry;
  }
  if (
    selectedEntryDetailState.dictionaryId === dictionary.id
    && selectedEntryDetailState.entryId === entryId
    && selectedEntryDetailState.status === "loading"
  ) {
    return selectedEntryDetailLoadPromise;
  }
  const requestId = selectedEntryDetailState.requestId + 1;
  const staleEntry = selectedEntryDetailState.status === "success"
    ? selectedEntryDetailState.entry
    : selectedEntryDetailState.staleEntry;
  const updateToken = beginStaleContentUpdate(
    "detail",
    Boolean(staleEntry && entryDetailHasSettledContent),
  );
  selectedEntryDetailState = {
    dictionaryId: dictionary.id,
    entryId,
    status: "loading",
    entry: null,
    staleEntry,
    error: null,
    requestId,
  };
  try {
    selectedEntryDetailLoadPromise = entryDetailCache.load({
      key: entryDetailCacheKey(dictionary.id, entryId),
      dictionaryId: dictionary.id,
      load: () => api(`/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries/${encodeURIComponent(entryId)}`),
    });
    const entry = await selectedEntryDetailLoadPromise;
    if (
      selectedEntryDetailState.requestId !== requestId
      || state.activeDictionaryId !== dictionary.id
      || state.selectedEntryId !== entryId
    ) {
      return entry;
    }
    selectedEntryDetailState = {
      dictionaryId: dictionary.id,
      entryId,
      status: "success",
      entry,
      staleEntry: null,
      error: null,
      requestId,
    };
    finishStaleContentUpdate("detail", updateToken);
    renderDetail();
    return entry;
  } catch (error) {
    if (selectedEntryDetailState.requestId === requestId) {
      selectedEntryDetailState = {
        dictionaryId: dictionary.id,
        entryId,
        status: "error",
        entry: null,
        staleEntry: null,
        error,
        requestId,
      };
      finishStaleContentUpdate("detail", updateToken);
      console.error(error);
      renderDetail();
    }
    return null;
  } finally {
    if (selectedEntryDetailState.requestId === requestId) {
      selectedEntryDetailLoadPromise = null;
    }
  }
}

function selectedDictionaryConfig() {
  return state.dictionaries.find((dictionary) => dictionary.id === state.selectedDictionaryConfigId) || null;
}

function entryPart(entry) {
  return entryParts(entry)[0] || "";
}

function entryParts(entry, dictionary = activeDictionary()) {
  return tagModel.entryParts(entry, normalizeDictionarySettings(dictionary?.settings), {
    normalizeText: searchNormalizationModel.normalizeStructuralKey,
  });
}

function entryPartLabels(entry, dictionary = activeDictionary()) {
  return entryParts(entry, dictionary).map((part) => displayTag(part, dictionary));
}

function entryPartText(entry, dictionary = activeDictionary()) {
  return entryPartLabels(entry, dictionary).join(", ");
}

function entryTagIsPart(entry, tagIndex, tag, dictionary = activeDictionary()) {
  return tagModel.entryTagIsPart(entry, tagIndex, tag, normalizeDictionarySettings(dictionary?.settings), {
    normalizeText: searchNormalizationModel.normalizeStructuralKey,
  });
}

function displayTag(tag, dictionary = activeDictionary()) {
  return tagModel.displayTag(tag, normalizeDictionarySettings(dictionary?.settings));
}

function entryListDisplayTag(tag, settings = normalizeDictionarySettings(activeDictionary()?.settings)) {
  return tagModel.entryListDisplayTag(tag, settings);
}

function tagIsRedHighlighted(tag, dictionary = activeDictionary()) {
  return tagModel.tagIsRedHighlighted(tag, normalizeDictionarySettings(dictionary?.settings), {
    normalizeText: searchNormalizationModel.normalizeStructuralKey,
  });
}

function normalize(value) {
  return searchNormalizationModel.normalizeSearchText(value, {
    locale: currentLanguage === "zh" ? "zh-CN" : "en-US",
  });
}

function splitList(value) {
  return String(value || "")
    .split(/[,\n，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueList(value) {
  const unique = [];
  splitList(Array.isArray(value) ? value.join("，") : value)
    .forEach((item) => {
      if (!unique.includes(item)) {
        unique.push(item);
      }
    });
  return unique;
}

function splitSourceText(value) {
  return String(value || "")
    .split(/[,，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function render() {
  closeEntryContextMenu();
  ensureValidSelection();
  applyLocale();
  applyTheme();
  renderShellNav();
  renderView();
  renderAvailability();
  renderShellEntryBrowser();
  renderMobileAppBar();
  renderHeader();
  renderToolNav();
  renderActiveView();
  restoreProcessScroll();
  scheduleEntryBrowserHeightUpdate();
}

function renderActiveView() {
  const dictionary = activeDictionary();
  if (state.activeView === "editor") {
    renderPartFilter();
    renderEntries();
    renderDetail();
    renderLexicalNetwork();
    return;
  }
  if (state.activeView === "manager") {
    renderDictionaryManager();
    fillDictionaryForm(selectedDictionaryConfig());
    return;
  }
  if (state.activeView === "settings") {
    fillSettingsForm(dictionary);
    return;
  }
  if (state.activeView === "docs") {
    renderLanguageDocs(dictionary);
    return;
  }
  if (state.activeView === "corpus") {
    renderCorpus(dictionary);
    return;
  }
  if (state.activeView === "morphology-functions") {
    fillMorphologyFunctionsForm(dictionary);
    return;
  }
  if (state.activeView === "morphology-tables") {
    renderMorphologyTablesConfig(dictionary);
    return;
  }
  if (state.activeView === "ipa") {
    fillIpaForm(dictionary);
    renderIpaSandbox();
    return;
  }
  if (state.activeView === "analysis") {
    renderAnalysis(dictionary);
    return;
  }
  if (state.activeView === "quality") {
    renderQuality(dictionary);
  }
}

function rememberProcessScroll() {
  if (state.activeView === "docs") {
    viewScrollMemory.docsPage = window.scrollY;
  } else if (state.activeView === "analysis") {
    const analysisViewState = activeAnalysisViewState();
    analysisViewState.scrollByRoute[analysisRouteKey()] = window.scrollY;
  } else if (state.activeView === "quality") {
    const qualityViewState = activeQualityViewState();
    qualityViewState.scrollBySubpage[qualityViewState.subpage] = window.scrollY;
  }
}

function restoreProcessScroll() {
  if (state.activeView !== "docs" && state.activeView !== "analysis" && state.activeView !== "quality") {
    return;
  }
  requestAnimationFrame(() => {
    if (state.activeView === "docs") {
      window.scrollTo({ top: viewScrollMemory.docsPage, behavior: "auto" });
      elements.docsMarkdownInput.scrollTop = viewScrollMemory.docsEditor;
      elements.docsPreview.scrollTop = viewScrollMemory.docsPreview;
    } else if (state.activeView === "analysis") {
      const analysisViewState = activeAnalysisViewState();
      window.scrollTo({ top: analysisViewState.scrollByRoute[analysisRouteKey()] || 0, behavior: "auto" });
    } else if (state.activeView === "quality") {
      const qualityViewState = activeQualityViewState();
      window.scrollTo({ top: qualityViewState.scrollBySubpage[qualityViewState.subpage] || 0, behavior: "auto" });
    }
  });
}

function rememberDocsPaneScroll() {
  viewScrollMemory.docsEditor = elements.docsMarkdownInput.scrollTop;
  viewScrollMemory.docsPreview = elements.docsPreview.scrollTop;
}

function createAnalysisViewState() {
  return {
    page: defaultAnalysisViewState.page,
    subpageByPage: { ...defaultAnalysisViewState.subpageByPage },
    scrollByRoute: {},
  };
}

function activeAnalysisViewState() {
  const dictionaryId = state.activeDictionaryId || "__none__";
  if (!analysisViewStates.has(dictionaryId)) {
    analysisViewStates.set(dictionaryId, createAnalysisViewState());
  }
  return analysisViewStates.get(dictionaryId);
}

function forgetAnalysisViewState(dictionaryId) {
  if (dictionaryId) {
    analysisViewStates.delete(dictionaryId);
  }
}

function createQualityViewState() {
  return {
    subpage: defaultQualityViewState.subpage,
    scrollBySubpage: {},
  };
}

function activeQualityViewState() {
  const dictionaryId = state.activeDictionaryId || "__none__";
  if (!qualityViewStates.has(dictionaryId)) {
    qualityViewStates.set(dictionaryId, createQualityViewState());
  }
  return qualityViewStates.get(dictionaryId);
}

function forgetQualityViewState(dictionaryId) {
  if (dictionaryId) {
    qualityViewStates.delete(dictionaryId);
  }
}

function analysisRouteKey(page = activeAnalysisViewState().page, subpage = activeAnalysisSubpage(page)) {
  return `${page}:${subpage || ""}`;
}

function activeAnalysisSubpage(page = activeAnalysisViewState().page) {
  const analysisViewState = activeAnalysisViewState();
  const subpages = analysisSubpages(page);
  if (!subpages.length) {
    return "";
  }
  const current = analysisViewState.subpageByPage[page];
  return subpages.some(([subpage]) => subpage === current) ? current : subpages[0][0];
}

function ensureValidSelection() {
  if (!state.dictionaries.length) {
    state.activeDictionaryId = "";
    state.selectedEntryId = "";
    state.selectedDictionaryConfigId = "";
    editorMode = "display";
    return;
  }

  if (!state.dictionaries.some((dictionary) => dictionary.id === state.activeDictionaryId)) {
    state.activeDictionaryId = state.dictionaries[0].id;
  }

  const dictionary = activeDictionary();
  if (!state.dictionaries.some((item) => item.id === state.selectedDictionaryConfigId)) {
    state.selectedDictionaryConfigId = state.activeDictionaryId;
  }

  const isDraftingNewEntry = editorMode === "edit" && !state.selectedEntryId;
  if (!isDraftingNewEntry && !dictionary.entries.some((entry) => entry.id === state.selectedEntryId)) {
    state.selectedEntryId = firstLemmaEntry(dictionary)?.id || "";
  }

  if (!["editor", "manager", "analysis", "quality", "settings", "docs", "corpus", "morphology-functions", "morphology-tables", "ipa"].includes(state.activeView)) {
    state.activeView = "editor";
  }

  if (!["display", "edit"].includes(editorMode)) {
    editorMode = "display";
  }
}

function applyLocale() {
  document.documentElement.lang = currentLanguage === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  });
  document.body.classList.toggle("english-locale", currentLanguage === "en");
  elements.brandEyebrow.hidden = currentLanguage === "en";
  elements.brandTitle.textContent = currentLanguage === "en" ? "CONLEXICON" : t("appTitle");
  elements.languageToggleButton.textContent = currentLanguage === "zh" ? "EN" : "中";
  const nextThemeLabel = currentTheme === "dark" ? t("lightMode") : t("darkMode");
  elements.themeToggleLabel.textContent = nextThemeLabel;
  elements.themeToggleButton.removeAttribute("title");
  elements.themeToggleButton.setAttribute("aria-label", nextThemeLabel);
  const nextLanguageLabel = currentLanguage === "zh" ? "English" : "中文";
  elements.languageToggleButton.removeAttribute("title");
  elements.languageToggleButton.setAttribute("aria-label", nextLanguageLabel);
}

function applyTheme() {
  document.body.classList.toggle("dark-theme", currentTheme === "dark");
}

function mobileShellMode() {
  return !desktopNavMediaQuery.matches;
}

function syncMobileDrawerBodyState() {
  const drawerOpen = mobileShellMode() && (shellState.navDrawerOpen || shellState.browserDrawerOpen);
  document.body.classList.toggle("mobile-drawer-open", drawerOpen);
  elements.appShell.dataset.navDrawer = shellState.navDrawerOpen ? "open" : "closed";
  elements.appShell.dataset.browserDrawer = shellState.browserDrawerOpen ? "open" : "closed";
  elements.mobileDrawerBackdrop.hidden = !drawerOpen;
}

function closeMobileDrawers() {
  if (!shellState.navDrawerOpen && !shellState.browserDrawerOpen) {
    syncMobileDrawerBodyState();
    return false;
  }
  shellState.navDrawerOpen = false;
  shellState.browserDrawerOpen = false;
  renderShellNav();
  renderShellEntryBrowser();
  renderMobileAppBar();
  return true;
}

function openMobileNavDrawer() {
  if (!mobileShellMode()) {
    return;
  }
  shellState.navDrawerOpen = true;
  shellState.browserDrawerOpen = false;
  renderShellNav();
  renderShellEntryBrowser();
  renderMobileAppBar();
}

function openMobileEntryBrowserDrawer() {
  if (!mobileShellMode() || state.activeView !== "editor" || !activeDictionary()) {
    return;
  }
  shellState.browserDrawerOpen = true;
  shellState.navDrawerOpen = false;
  renderShellNav();
  renderShellEntryBrowser();
  renderMobileAppBar();
  requestAnimationFrame(() => {
    remeasureEntryVirtualList();
    flushPendingEntryCardScroll();
  });
}

function closeMobileEntryBrowserDrawer() {
  if (!shellState.browserDrawerOpen) {
    return;
  }
  shellState.browserDrawerOpen = false;
  renderShellEntryBrowser();
  renderMobileAppBar();
}

function entryBrowserCanScrollNow() {
  const container = entryVirtualList.container;
  return Boolean(
    container
    && !elements.entryBrowser.hidden
    && container.offsetParent !== null
    && container.clientHeight > 0
  );
}

function entryCardScrollQueryIsReady() {
  const dictionary = activeDictionary();
  if (!dictionary || advancedFilter) {
    return true;
  }
  if (rootMode && rootGroupsQueryCanUseApi(dictionary)) {
    return rootGroupsQueryState.status === "success"
      && rootGroupsQueryState.key === rootGroupsQueryApiKey(dictionary);
  }
  if (!rootMode && entryQueryCanUseApi(dictionary)) {
    return entryQueryState.status === "success"
      && entryQueryState.key === entryQueryApiKey(dictionary);
  }
  return true;
}

function flushPendingEntryCardScroll() {
  if (!pendingEntryCardScroll) {
    return;
  }
  const { entryId, options } = pendingEntryCardScroll;
  ensureQueryWindowForEntryScroll(entryId, options);
  const requestId = entryCardScrollRequestId += 1;
  requestAnimationFrame(() => {
    if (requestId !== entryCardScrollRequestId || !pendingEntryCardScroll) {
      return;
    }
    if (!entryBrowserCanScrollNow() || !entryCardScrollQueryIsReady()) {
      return;
    }
    let key = `entry:${entryId}`;
    if (rootMode && !advancedFilter) {
      key = options.rootId && options.rootId !== entryId
        ? `derived:${options.rootId}:${entryId}`
        : `root:${options.rootId || entryId}`;
    }
    const stableScrollOptions = {
      isCurrent: () => requestId === entryCardScrollRequestId,
    };
    if (scrollVirtualListItemIntoViewStable(entryVirtualList, key, stableScrollOptions)) {
      if (pendingEntryCardScroll?.entryId === entryId) {
        pendingEntryCardScroll = null;
      }
      return;
    }
    const row = entryVirtualList.items.find((item) => item.value?.entry?.id === entryId || item.value?.group?.root?.id === entryId);
    if (row) {
      const scrolled = scrollVirtualListItemIntoViewStable(entryVirtualList, row.key, stableScrollOptions);
      if (scrolled && pendingEntryCardScroll?.entryId === entryId) {
        pendingEntryCardScroll = null;
      }
    }
  });
}

function revealEntryBrowserForResults() {
  if (!activeDictionary()) {
    return;
  }
  if (mobileShellMode()) {
    shellState.navDrawerOpen = false;
    shellState.browserDrawerOpen = true;
    return;
  }
  shellState.browserCollapsedByView.editor = false;
  shellState.browserDrawerOpen = false;
}

function renderMobileAppBar() {
  const isMobile = mobileShellMode();
  elements.mobileAppBar.hidden = !isMobile;
  if (!isMobile) {
    shellState.navDrawerOpen = false;
    shellState.browserDrawerOpen = false;
    syncMobileDrawerBodyState();
    return;
  }

  const hasDictionary = Boolean(activeDictionary());
  const canOpenEntryList = backendAvailable && hasDictionary && state.activeView === "editor";
  const navLabel = t(shellState.navDrawerOpen ? "closeToolNavigation" : "openToolNavigation");
  const listLabel = t(shellState.browserDrawerOpen ? "closeEntryList" : "openEntryList");
  elements.mobileCurrentViewLabel.textContent = toolNavLabel(state.activeView);
  elements.mobileNavButton.setAttribute("aria-expanded", String(shellState.navDrawerOpen));
  elements.mobileNavButton.setAttribute("aria-label", navLabel);
  elements.mobileEntryListButton.hidden = state.activeView !== "editor";
  elements.mobileEntryListButton.disabled = !canOpenEntryList;
  elements.mobileEntryListButton.setAttribute("aria-expanded", String(shellState.browserDrawerOpen));
  elements.mobileEntryListButton.setAttribute("aria-label", listLabel);
  elements.mobileNewEntryButton.hidden = state.activeView !== "editor";
  elements.mobileNewEntryButton.disabled = !backendAvailable || !hasDictionary;
  syncMobileDrawerBodyState();
}

function effectiveNavCollapsed() {
  if (!desktopNavMediaQuery.matches) {
    return false;
  }
  return wideNavMediaQuery.matches ? shellState.wideNavCollapsed : true;
}

function renderShellNav() {
  hideAppTooltip();
  if (mobileShellMode()) {
    const navState = "drawer";
    elements.appShell.dataset.navState = navState;
    elements.appNav.dataset.navState = navState;
    elements.appNav.hidden = !shellState.navDrawerOpen;
    elements.navCollapseButton.hidden = true;
    elements.mobileNavButton.setAttribute("aria-expanded", String(shellState.navDrawerOpen));
    syncMobileDrawerBodyState();
    return;
  }
  const collapsed = effectiveNavCollapsed();
  shellState.navCollapsed = collapsed;
  const navState = collapsed ? "rail" : "expanded";
  elements.appShell.dataset.navState = navState;
  elements.appNav.dataset.navState = navState;
  elements.appNav.hidden = false;
  shellState.navDrawerOpen = false;
  elements.navCollapseButton.hidden = !wideNavMediaQuery.matches;
  elements.navCollapseButton.setAttribute("aria-expanded", String(!collapsed));
  const controlLabel = t(collapsed ? "expandNavigation" : "collapseNavigation");
  elements.navCollapseButton.setAttribute("aria-label", controlLabel);
  syncMobileDrawerBodyState();
}

function appTooltipEnabledFor(target) {
  if (!target) {
    return false;
  }
  if (target.dataset.appTooltip === "always") {
    return true;
  }
  if (target.dataset.appTooltip === "overflow") {
    return appTooltipTargetOverflows(target);
  }
  return elements.appNav.contains(target)
    && (shellState.navCollapsed || target.classList.contains("icon-button"));
}

function appTooltipTargetOverflows(target) {
  const content = target.querySelector("[data-tooltip-overflow]") || target;
  return content.scrollWidth > content.clientWidth + 1
    || content.scrollHeight > content.clientHeight + 1;
}

function appTooltipLabelFor(target) {
  return target.dataset.appTooltipLabel || target.getAttribute("aria-label") || "";
}

function appTooltipHtmlFor(target) {
  return target.dataset.appTooltipHtml || "";
}

function appTooltipTargetIsVisible(target) {
  return Boolean(target)
    && target.isConnected
    && !target.hidden
    && target.getClientRects().length > 0;
}

function appTooltipTargetHasKeyboardFocus(target) {
  return document.activeElement === target && target.matches(":focus-visible");
}

function appTooltipTargetFromEvent(event) {
  return event.target instanceof Element
    ? event.target.closest("#appNav button, [data-app-tooltip]")
    : null;
}

function showAppTooltip(target) {
  if (!appTooltipEnabledFor(target) || target.hidden) {
    return;
  }
  const label = appTooltipLabelFor(target);
  if (!label) {
    return;
  }
  hideAppTooltip();
  activeAppTooltipTarget = target;
  const html = appTooltipHtmlFor(target);
  if (html) {
    elements.appTooltip.innerHTML = html;
  } else {
    elements.appTooltip.textContent = label;
  }
  elements.appTooltip.classList.toggle("wrap", target.dataset.appTooltipWrap === "true");
  elements.appTooltip.classList.toggle("chip-list-tooltip", target.dataset.appTooltipVariant === "chip-list");
  elements.appTooltip.classList.toggle("tag-info-tooltip", target.dataset.appTooltipVariant === "tag-info");
  elements.appTooltip.hidden = false;
  target.setAttribute("aria-describedby", "appTooltip");
  requestAnimationFrame(() => {
    if (activeAppTooltipTarget !== target || elements.appTooltip.hidden) {
      return;
    }
    if (!appTooltipTargetIsVisible(target)) {
      hideAppTooltip();
      return;
    }
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = elements.appTooltip.getBoundingClientRect();
    const isNavTarget = elements.appNav.contains(target);
    let left;
    let top;
    if (isNavTarget) {
      left = targetRect.right + 10;
      top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
    } else {
      left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
      top = targetRect.bottom + 8;
      if (top + tooltipRect.height > window.innerHeight - 8) {
        top = targetRect.top - tooltipRect.height - 8;
      }
    }
    left = Math.max(8, Math.min(window.innerWidth - tooltipRect.width - 8, left));
    top = Math.max(8, Math.min(window.innerHeight - tooltipRect.height - 8, top));
    elements.appTooltip.style.left = `${left}px`;
    elements.appTooltip.style.top = `${top}px`;
  });
}

function hideAppTooltip() {
  if (activeAppTooltipTarget) {
    activeAppTooltipTarget.removeAttribute("aria-describedby");
  }
  activeAppTooltipTarget = null;
  elements.appTooltip.classList.remove("wrap");
  elements.appTooltip.classList.remove("chip-list-tooltip");
  elements.appTooltip.classList.remove("tag-info-tooltip");
  elements.appTooltip.textContent = "";
  elements.appTooltip.hidden = true;
}

function syncAppTooltipVisibility() {
  const target = activeAppTooltipTarget;
  if (!target) {
    return;
  }
  if (!appTooltipTargetIsVisible(target) || !appTooltipEnabledFor(target)) {
    hideAppTooltip();
    return;
  }
  if (target.matches(":hover") || appTooltipTargetHasKeyboardFocus(target)) {
    return;
  }
  hideAppTooltip();
}

function effectiveEntryBrowserCollapsed(view = state.activeView) {
  return desktopNavMediaQuery.matches
    && view === "editor"
    && Boolean(shellState.browserCollapsedByView[view]);
}

function renderShellEntryBrowser() {
  hideAppTooltip();
  if (mobileShellMode()) {
    const canOpenDrawer = backendAvailable && Boolean(activeDictionary()) && state.activeView === "editor";
    if (!canOpenDrawer) {
      shellState.browserDrawerOpen = false;
    }
    elements.appShell.dataset.browserState = shellState.browserDrawerOpen ? "drawer" : "expanded";
    elements.contentGrid.dataset.browserState = "expanded";
    elements.entryBrowser.hidden = !canOpenDrawer || !shellState.browserDrawerOpen;
    elements.entryBrowserToggleButton.hidden = true;
    elements.mobileEntryListButton.setAttribute("aria-expanded", String(shellState.browserDrawerOpen));
    elements.mobileEntryListButton.setAttribute("aria-label", t(shellState.browserDrawerOpen ? "closeEntryList" : "openEntryList"));
    syncMobileDrawerBodyState();
    if (shellState.browserDrawerOpen) {
      requestAnimationFrame(() => {
        remeasureEntryVirtualList();
        flushPendingEntryCardScroll();
      });
    }
    return;
  }
  shellState.browserDrawerOpen = false;
  const canToggle = desktopNavMediaQuery.matches
    && backendAvailable
    && Boolean(activeDictionary())
    && state.activeView === "editor";
  const collapsed = canToggle && effectiveEntryBrowserCollapsed("editor");
  const browserState = collapsed ? "collapsed" : "expanded";
  elements.appShell.dataset.browserState = browserState;
  elements.contentGrid.dataset.browserState = browserState;
  elements.entryBrowser.hidden = collapsed;
  elements.entryBrowserToggleButton.hidden = !canToggle;
  elements.entryBrowserToggleButton.setAttribute("aria-expanded", String(!collapsed));
  const controlLabel = t(collapsed ? "expandEntryBrowser" : "collapseEntryBrowser");
  elements.entryBrowserToggleButton.setAttribute("aria-label", controlLabel);
  elements.entryBrowserToggleButton.removeAttribute("title");
  syncMobileDrawerBodyState();
  scheduleEntryBrowserHeightUpdate();
}

function updateEntryBrowserHeight() {
  entryBrowserHeightFrame = 0;
  const browser = elements.entryBrowser;
  if (!browser || browser.hidden || state.activeView !== "editor" || !desktopNavMediaQuery.matches) {
    clearEntryBrowserLayoutVariables();
    return;
  }
  const gridRect = elements.contentGrid.getBoundingClientRect();
  const bottomGap = 20;
  const stickyTop = 20;
  const top = Math.max(stickyTop, gridRect.top);
  const columns = getComputedStyle(elements.contentGrid).gridTemplateColumns.split(/\s+/);
  const firstColumnWidth = Number.parseFloat(columns[0]) || browser.getBoundingClientRect().width || 340;
  const availableHeight = Math.max(220, window.innerHeight - top - bottomGap);
  const nextLeft = `${Math.round(gridRect.left)}px`;
  const nextTop = `${Math.round(top)}px`;
  const nextWidth = `${Math.round(firstColumnWidth)}px`;
  const nextHeight = `${Math.round(availableHeight)}px`;
  const widthChanged = browser.style.getPropertyValue("--entry-browser-fixed-width") !== nextWidth;
  if (
    browser.style.getPropertyValue("--entry-browser-fixed-left") === nextLeft
    && browser.style.getPropertyValue("--entry-browser-fixed-top") === nextTop
    && browser.style.getPropertyValue("--entry-browser-fixed-width") === nextWidth
    && browser.style.getPropertyValue("--entry-browser-height") === nextHeight
  ) {
    elements.contentGrid.dataset.browserLayout = "ready";
    return;
  }
  const scrollPin = entryVirtualListScrollPin();
  browser.style.setProperty("--entry-browser-fixed-left", nextLeft);
  browser.style.setProperty("--entry-browser-fixed-top", nextTop);
  browser.style.setProperty("--entry-browser-fixed-width", nextWidth);
  browser.style.setProperty("--entry-browser-height", nextHeight);
  elements.contentGrid.dataset.browserLayout = "ready";
  syncEntryVirtualListAfterBrowserLayoutChange({ widthChanged, scrollPin });
}

function clearEntryBrowserLayoutVariables() {
  const browser = elements.entryBrowser;
  if (!browser) {
    return;
  }
  browser.style.removeProperty("--entry-browser-fixed-left");
  browser.style.removeProperty("--entry-browser-fixed-top");
  browser.style.removeProperty("--entry-browser-fixed-width");
  browser.style.removeProperty("--entry-browser-height");
  elements.contentGrid.dataset.browserLayout = "pending";
}

function scheduleEntryBrowserHeightUpdate() {
  if (entryBrowserHeightFrame) {
    return;
  }
  entryBrowserHeightFrame = requestAnimationFrame(updateEntryBrowserHeight);
}

function scheduleEntryBrowserLayoutRefresh(duration = 240) {
  entryBrowserLayoutRefreshUntil = Math.max(entryBrowserLayoutRefreshUntil, performance.now() + duration);
  if (entryBrowserLayoutRefreshFrame) {
    return;
  }
  const refresh = () => {
    entryBrowserLayoutRefreshFrame = 0;
    updateEntryBrowserHeight();
    if (performance.now() < entryBrowserLayoutRefreshUntil) {
      entryBrowserLayoutRefreshFrame = requestAnimationFrame(refresh);
    }
  };
  entryBrowserLayoutRefreshFrame = requestAnimationFrame(refresh);
}

function remeasureEntryVirtualList() {
  const container = entryVirtualList.container;
  if (!container || container.offsetParent === null) {
    return;
  }
  const anchor = virtualListAnchor(entryVirtualList);
  const width = Math.round(container.clientWidth);
  if (entryVirtualList.width && width && entryVirtualList.width !== width) {
    entryVirtualList.sizes.clear();
  }
  entryVirtualList.width = width;
  rebuildVirtualListOffsets(entryVirtualList);
  restoreVirtualListAnchor(entryVirtualList, anchor);
  clampVirtualListScroll(entryVirtualList);
  renderVirtualListWindow(entryVirtualList);
}

function entryVirtualListScrollPin() {
  const container = entryVirtualList.container;
  if (!container) {
    return null;
  }
  const totalHeight = entryVirtualList.offsets[entryVirtualList.offsets.length - 1] || 0;
  const maxScrollTop = Math.max(0, totalHeight - container.clientHeight);
  return {
    scrollTop: container.scrollTop,
    wasAtBottom: maxScrollTop > 0 && container.scrollTop >= maxScrollTop - 2,
  };
}

function syncEntryVirtualListAfterBrowserLayoutChange(options = {}) {
  const container = entryVirtualList.container;
  if (!container || container.offsetParent === null) {
    return;
  }
  const scrollPin = options.scrollPin || entryVirtualListScrollPin();
  if (options.widthChanged) {
    const anchor = virtualListAnchor(entryVirtualList);
    entryVirtualList.sizes.clear();
    entryVirtualList.width = Math.round(container.clientWidth);
    rebuildVirtualListOffsets(entryVirtualList);
    restoreVirtualListAnchor(entryVirtualList, anchor);
  } else if (scrollPin?.wasAtBottom) {
    container.scrollTop = Math.max(0, (entryVirtualList.offsets[entryVirtualList.offsets.length - 1] || 0) - container.clientHeight);
  } else {
    container.scrollTop = scrollPin?.scrollTop || 0;
  }
  clampVirtualListScroll(entryVirtualList);
  renderVirtualListWindow(entryVirtualList);
}

function toggleEntryBrowser() {
  const view = "editor";
  shellState.browserCollapsedByView[view] = !effectiveEntryBrowserCollapsed(view);
  renderShellEntryBrowser();
  if (!effectiveEntryBrowserCollapsed(view)) {
    scheduleEntryBrowserHeightUpdate();
    requestAnimationFrame(() => flushPendingEntryCardScroll());
  }
}

function renderAvailability() {
  const hasDictionary = Boolean(activeDictionary());
  const settings = normalizeDictionarySettings(activeDictionary()?.settings);
  elements.backendNotice.hidden = backendAvailable;
  elements.managerBackendNotice.hidden = backendAvailable;
  elements.emptyDictionaryNotice.hidden = !backendAvailable || hasDictionary || state.activeView !== "editor";
  elements.settingsNoDictionaryNotice.hidden = !backendAvailable || hasDictionary || state.activeView !== "settings";
  elements.settingsPanel.hidden = !backendAvailable || !hasDictionary || state.activeView !== "settings";
  elements.analysisNoDictionaryNotice.hidden = !backendAvailable || hasDictionary || state.activeView !== "analysis";
  elements.analysisPanel.hidden = !backendAvailable || !hasDictionary || state.activeView !== "analysis";
  elements.qualityNoDictionaryNotice.hidden = !backendAvailable || hasDictionary || state.activeView !== "quality";
  elements.qualityPanel.hidden = !backendAvailable || !hasDictionary || state.activeView !== "quality";
  elements.docsNoDictionaryNotice.hidden = !backendAvailable || hasDictionary || state.activeView !== "docs";
  elements.docsPanel.hidden = !backendAvailable || !hasDictionary || state.activeView !== "docs";
  elements.saveDocsButton.hidden = !backendAvailable || !hasDictionary || state.activeView !== "docs" || settings.docsAutoSave;
  elements.corpusNoDictionaryNotice.hidden = !backendAvailable || hasDictionary || state.activeView !== "corpus";
  elements.corpusPanel.hidden = !backendAvailable || !hasDictionary || state.activeView !== "corpus";
  elements.saveCorpusButton.hidden = !backendAvailable || !hasDictionary || state.activeView !== "corpus" || settings.corpusAutoSave;
  elements.morphologyFunctionsNoDictionaryNotice.hidden = !backendAvailable || hasDictionary || state.activeView !== "morphology-functions";
  elements.morphologyFunctionsPanel.hidden = !backendAvailable || !hasDictionary || state.activeView !== "morphology-functions";
  elements.morphologyTablesNoDictionaryNotice.hidden = !backendAvailable || hasDictionary || state.activeView !== "morphology-tables";
  elements.morphologyTablesPanel.hidden = !backendAvailable || !hasDictionary || state.activeView !== "morphology-tables";
  elements.ipaNoDictionaryNotice.hidden = !backendAvailable || hasDictionary || state.activeView !== "ipa";
  elements.ipaPanel.hidden = !backendAvailable || !hasDictionary || state.activeView !== "ipa";
  elements.batchIpaAllButton.disabled = !backendAvailable || !hasDictionary;
  elements.batchIpaMissingButton.disabled = !backendAvailable || !hasDictionary;
  elements.editorTopBar.hidden = !backendAvailable || !hasDictionary;
  elements.contentGrid.hidden = !backendAvailable || !hasDictionary;
  elements.toolList.hidden = !backendAvailable;
  elements.managerGrid.hidden = !backendAvailable;
  elements.newEntryButton.hidden = !backendAvailable || !hasDictionary;
  elements.addDictionaryButton.disabled = !backendAvailable;
  elements.importInput.disabled = !backendAvailable;

  if (!backendAvailable) {
    const message = `${backendMessage} ${t("backendHint")}`;
    elements.backendNoticeText.textContent = message;
    elements.managerBackendNoticeText.textContent = message;
  }
}

function renderView() {
  elements.editorView.classList.toggle("active", state.activeView === "editor");
  elements.dictionaryManagerView.classList.toggle("active", state.activeView === "manager");
  elements.analysisView.classList.toggle("active", state.activeView === "analysis");
  elements.qualityView.classList.toggle("active", state.activeView === "quality");
  elements.settingsView.classList.toggle("active", state.activeView === "settings");
  elements.docsView.classList.toggle("active", state.activeView === "docs");
  elements.corpusView.classList.toggle("active", state.activeView === "corpus");
  elements.morphologyFunctionsView.classList.toggle("active", state.activeView === "morphology-functions");
  elements.morphologyTablesView.classList.toggle("active", state.activeView === "morphology-tables");
  elements.ipaView.classList.toggle("active", state.activeView === "ipa");
}

function renderToolNav() {
  const order = normalizeToolNavOrder(activeDictionary()?.settings?.toolNavOrder);
  order.forEach((view) => {
    const button = [...elements.toolButtons].find((item) => item.dataset.view === view);
    if (button) {
      elements.toolList.append(button);
    }
  });
  elements.toolButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.activeView);
  });
}

function renderHeader() {
  const dictionary = activeDictionary();
  elements.newEntryButton.disabled = !dictionary;
  elements.entryListNewEntryButton.disabled = !dictionary;

  if (!backendAvailable) {
    elements.dictionaryTitle.textContent = t("backendOffline");
    elements.dictionaryMeta.textContent = t("backendApiMessage");
    return;
  }

  if (!dictionary) {
    elements.dictionaryTitle.textContent = t("noDictionary");
    elements.dictionaryMeta.textContent = t("emptyDictionaryBody");
    return;
  }

  elements.dictionaryTitle.textContent = dictionary.name;
  const details = dictionary.language ? ` · ${dictionary.language}` : "";
  elements.dictionaryMeta.textContent = `${dictionaryStatsText(dictionary)}${details}`;
}

function firstLemmaEntry(dictionary) {
  return [...(dictionary?.entries || [])].sort((a, b) => a.lemma.localeCompare(b.lemma, "zh-CN"))[0] || null;
}

function renderPartFilter() {
  const dictionary = activeDictionary();
  if (advancedFilter) {
    rootMode = false;
    activePart = "";
    searchQuery = "";
    elements.searchInput.value = "";
  } else if (rootMode) {
    activePart = "";
    elements.partFilter.value = "";
  }
  startEntryFacetsApiCheck(dictionary);
  const usedParts = entryFacetsPartsForRender(dictionary) || localPartTags(dictionary);
  const options = ["", NO_PART_FILTER_VALUE, ...usedParts];
  const current = activePart;

  elements.partFilter.innerHTML = options
    .map((part) => {
      const label = part === NO_PART_FILTER_VALUE
        ? t("noPart")
        : (part ? displayTag(part, dictionary) : t("allParts"));
      return `<option value="${escapeHtml(part)}">${escapeHtml(label)}</option>`;
    })
    .join("");

  elements.partFilter.value = options.includes(current) ? current : "";
  elements.partFilter.disabled = rootMode || Boolean(advancedFilter);
  elements.searchInput.disabled = Boolean(advancedFilter);
  activePart = elements.partFilter.value;
  elements.rootModeToggleButton.textContent = rootMode ? t("normalMode") : t("rootMode");
  elements.rootModeToggleButton.classList.toggle("active", rootMode);
  elements.rootModeToggleButton.hidden = Boolean(advancedFilter);
  elements.expandAllRootsButton.hidden = !rootMode || Boolean(advancedFilter);
  elements.collapseAllRootsButton.hidden = !rootMode || Boolean(advancedFilter);
  elements.advancedFilterToolbar.hidden = !advancedFilter;
  elements.advancedFilterCycleButton.hidden = !canCycleAdvancedFilter();
  const advancedFilterTitle = advancedFilter ? advancedFilterDisplayTitle() : "";
  elements.advancedFilterLabel.innerHTML = advancedFilterTitle
    ? `<span data-tooltip-overflow>${escapeHtml(advancedFilterTitle)}</span>`
    : "";
  if (advancedFilterTitle) {
    elements.advancedFilterLabel.setAttribute("aria-label", advancedFilterTitle);
  } else {
    elements.advancedFilterLabel.removeAttribute("aria-label");
  }
  const hasRootSearch = Boolean(normalizeEntrySearchText(searchQuery));
  const rootGroupsReady = rootMode && rootGroupsQueryState.status === "success";
  elements.expandAllRootsButton.disabled = rootMode
    && (hasRootSearch || !rootGroupsReady || (rootExpansionMode === "all" && !collapsedRootEntries.size));
  elements.collapseAllRootsButton.disabled = rootMode
    && (hasRootSearch || !rootGroupsReady || (rootExpansionMode === "manual" && !expandedRootEntries.size));
}

function createVirtualListState(estimatedItemHeight) {
  return {
    container: null,
    items: [],
    indexByKey: new Map(),
    offsets: [0],
    sizes: new Map(),
    estimatedItemHeight,
    resetToken: "",
    renderItem: null,
    frame: 0,
    width: 0,
    resizeObserver: null,
    viewportObserver: null,
    scrollHandler: null,
    lastScrollAt: 0,
    lastRenderAt: 0,
    lastResizeFlushAt: 0,
    renderThrottleTimer: 0,
    resizeFrame: 0,
    resizeThrottleTimer: 0,
    resizeIdleTimer: 0,
    pendingResizeAnchor: null,
    pendingSizeUpdates: new Map(),
    sizeCacheKeys: new Map(),
    heightCache: new Map(),
    onRangeChange: null,
  };
}

function clampVirtualListScroll(virtualList) {
  const container = virtualList.container;
  if (!container) {
    return;
  }
  const totalHeight = virtualList.offsets[virtualList.offsets.length - 1] || 0;
  const maxScrollTop = Math.max(0, totalHeight - container.clientHeight);
  if (container.scrollTop > maxScrollTop) {
    container.scrollTop = maxScrollTop;
  }
}

function initializeVirtualList(virtualList, container) {
  if (virtualList.container === container) {
    return;
  }
  if (virtualList.container && virtualList.scrollHandler) {
    virtualList.container.removeEventListener("scroll", virtualList.scrollHandler);
  }
  virtualList.resizeObserver?.disconnect();
  virtualList.viewportObserver?.disconnect();
  if (virtualList.renderThrottleTimer) {
    clearTimeout(virtualList.renderThrottleTimer);
    virtualList.renderThrottleTimer = 0;
  }
  if (virtualList.resizeFrame) {
    cancelAnimationFrame(virtualList.resizeFrame);
    virtualList.resizeFrame = 0;
  }
  if (virtualList.resizeThrottleTimer) {
    clearTimeout(virtualList.resizeThrottleTimer);
    virtualList.resizeThrottleTimer = 0;
  }
  if (virtualList.resizeIdleTimer) {
    clearTimeout(virtualList.resizeIdleTimer);
    virtualList.resizeIdleTimer = 0;
  }
  virtualList.pendingResizeAnchor = null;
  virtualList.pendingSizeUpdates.clear();
  virtualList.container = container;
  virtualList.lastScrollAt = 0;
  virtualList.lastResizeFlushAt = 0;
  virtualList.scrollHandler = () => {
    virtualList.lastScrollAt = performance.now();
    if (virtualList.pendingSizeUpdates.size) {
      scheduleVirtualListResizeIdleFlush(virtualList);
    }
    scheduleVirtualListThrottledRender(virtualList);
  };
  container.addEventListener("scroll", virtualList.scrollHandler, { passive: true });
  if (typeof ResizeObserver === "undefined") {
    return;
  }
  virtualList.resizeObserver = new ResizeObserver((entries) => {
    const activelyScrolling = virtualListIsActivelyScrolling(virtualList);
    const anchor = activelyScrolling ? null : virtualListAnchor(virtualList);
    let changed = false;
    entries.forEach((entry) => {
      const key = entry.target.dataset.virtualKey;
      const sizeCacheKey = entry.target.dataset.virtualSizeKey || "";
      const item = virtualListItemByKey(virtualList, key);
      if (!item || (sizeCacheKey && item.sizeCacheKey !== sizeCacheKey)) {
        return;
      }
      const height = entry.borderBoxSize?.[0]?.blockSize || entry.target.getBoundingClientRect().height;
      const pendingUpdate = virtualList.pendingSizeUpdates.get(key);
      const current = (typeof pendingUpdate === "number" ? pendingUpdate : pendingUpdate?.height)
        || virtualList.sizes.get(key)
        || 0;
      if (key && height > 0 && Math.abs(current - height) > VIRTUAL_LIST_RESIZE_EPSILON) {
        rememberVirtualListHeight(virtualList, item.sizeCacheKey, height);
        if (activelyScrolling) {
          virtualList.pendingSizeUpdates.set(key, { height, sizeCacheKey: item.sizeCacheKey });
          changed = true;
          return;
        }
        virtualList.sizes.set(key, height);
        changed = true;
      }
    });
    if (!changed) {
      return;
    }
    if (activelyScrolling) {
      scheduleVirtualListResizeIdleFlush(virtualList);
      return;
    }
    scheduleVirtualListResizeUpdate(virtualList, anchor);
  });
  virtualList.viewportObserver = new ResizeObserver((entries) => {
    const width = Math.round(entries[0]?.contentRect?.width || container.clientWidth);
    if (virtualList.width && width && width !== virtualList.width) {
      virtualList.width = width;
      virtualList.sizes.clear();
      virtualList.pendingSizeUpdates.clear();
      refreshVirtualListCachedSizes(virtualList);
      rebuildVirtualListOffsets(virtualList);
    } else {
      virtualList.width = width;
    }
    scheduleVirtualListRender(virtualList);
  });
  virtualList.viewportObserver.observe(container);
}

function virtualListWidthBucket(virtualList, container = virtualList.container) {
  const width = Math.round(virtualList.width || container?.clientWidth || 0);
  if (!width) {
    return 0;
  }
  return Math.max(0, Math.round(width / VIRTUAL_LIST_HEIGHT_CACHE_WIDTH_BUCKET) * VIRTUAL_LIST_HEIGHT_CACHE_WIDTH_BUCKET);
}

function virtualListSizeCacheKey(virtualList, rawKey, container = virtualList.container) {
  if (!rawKey) {
    return "";
  }
  return `${virtualListWidthBucket(virtualList, container)}|${rawKey}`;
}

function virtualListItemByKey(virtualList, key) {
  const index = virtualList.indexByKey.get(key);
  return index === undefined ? null : virtualList.items[index] || null;
}

function rememberVirtualListHeight(virtualList, sizeCacheKey, height) {
  if (!sizeCacheKey || !(height > 0)) {
    return;
  }
  if (virtualList.heightCache.has(sizeCacheKey)) {
    virtualList.heightCache.delete(sizeCacheKey);
  }
  virtualList.heightCache.set(sizeCacheKey, height);
  while (virtualList.heightCache.size > VIRTUAL_LIST_HEIGHT_CACHE_LIMIT) {
    const oldestKey = virtualList.heightCache.keys().next().value;
    virtualList.heightCache.delete(oldestKey);
  }
}

function cachedVirtualListHeight(virtualList, sizeCacheKey) {
  const height = virtualList.heightCache.get(sizeCacheKey);
  return height > 0 ? height : 0;
}

function refreshVirtualListCachedSizes(virtualList) {
  virtualList.sizeCacheKeys.clear();
  virtualList.items.forEach((item) => {
    item.sizeCacheKey = virtualListSizeCacheKey(virtualList, item.rawSizeCacheKey);
    if (item.sizeCacheKey) {
      virtualList.sizeCacheKeys.set(item.key, item.sizeCacheKey);
      const cachedHeight = cachedVirtualListHeight(virtualList, item.sizeCacheKey);
      if (cachedHeight) {
        virtualList.sizes.set(item.key, cachedHeight);
      }
    }
  });
}

function virtualListIsActivelyScrolling(virtualList) {
  return performance.now() - (virtualList.lastScrollAt || 0) < VIRTUAL_LIST_ACTIVE_SCROLL_MS;
}

function applyVirtualListPendingSizeUpdates(virtualList) {
  if (!virtualList.pendingSizeUpdates.size) {
    return false;
  }
  let changed = false;
  virtualList.pendingSizeUpdates.forEach((update, key) => {
    const height = typeof update === "number" ? update : update?.height;
    const sizeCacheKey = typeof update === "number" ? virtualList.sizeCacheKeys.get(key) : update?.sizeCacheKey;
    if (key && height > 0 && sizeCacheKey && virtualList.sizeCacheKeys.get(key) !== sizeCacheKey) {
      return;
    }
    if (key && height > 0 && Math.abs((virtualList.sizes.get(key) || 0) - height) > VIRTUAL_LIST_RESIZE_EPSILON) {
      virtualList.sizes.set(key, height);
      rememberVirtualListHeight(virtualList, sizeCacheKey, height);
      changed = true;
    }
  });
  virtualList.pendingSizeUpdates.clear();
  return changed;
}

function scheduleVirtualListResizeIdleFlush(virtualList) {
  if (!virtualList.pendingSizeUpdates.size) {
    return;
  }
  const now = performance.now();
  if (virtualList.resizeIdleTimer) {
    clearTimeout(virtualList.resizeIdleTimer);
  }
  virtualList.resizeIdleTimer = setTimeout(() => {
    virtualList.resizeIdleTimer = 0;
    if (!virtualList.pendingSizeUpdates.size) {
      return;
    }
    if (virtualList.resizeThrottleTimer) {
      clearTimeout(virtualList.resizeThrottleTimer);
      virtualList.resizeThrottleTimer = 0;
    }
    virtualList.lastResizeFlushAt = performance.now();
    scheduleVirtualListResizeUpdate(virtualList, virtualListAnchor(virtualList));
  }, VIRTUAL_LIST_RESIZE_IDLE_FLUSH_MS);
  const elapsed = virtualList.lastResizeFlushAt ? now - virtualList.lastResizeFlushAt : 0;
  const wait = virtualList.lastResizeFlushAt
    ? Math.max(0, VIRTUAL_LIST_RESIZE_THROTTLE_MS - elapsed)
    : VIRTUAL_LIST_RESIZE_THROTTLE_MS;
  if (wait <= 0) {
    virtualList.lastResizeFlushAt = now;
    scheduleVirtualListResizeUpdate(virtualList, virtualListAnchor(virtualList));
    return;
  }
  if (virtualList.resizeThrottleTimer) {
    return;
  }
  virtualList.resizeThrottleTimer = setTimeout(() => {
    virtualList.resizeThrottleTimer = 0;
    if (!virtualList.pendingSizeUpdates.size) {
      return;
    }
    virtualList.lastResizeFlushAt = performance.now();
    scheduleVirtualListResizeUpdate(virtualList, virtualListAnchor(virtualList));
  }, wait);
}

function scheduleVirtualListResizeUpdate(virtualList, anchor) {
  if (!virtualList.pendingResizeAnchor) {
    virtualList.pendingResizeAnchor = anchor;
  }
  if (virtualList.resizeFrame) {
    return;
  }
  virtualList.resizeFrame = requestAnimationFrame(() => {
    virtualList.resizeFrame = 0;
    const pendingAnchor = virtualList.pendingResizeAnchor;
    virtualList.pendingResizeAnchor = null;
    applyVirtualListPendingSizeUpdates(virtualList);
    rebuildVirtualListOffsets(virtualList);
    if (!virtualListIsActivelyScrolling(virtualList)) {
      restoreVirtualListAnchor(virtualList, pendingAnchor);
    }
    clampVirtualListScroll(virtualList);
    scheduleVirtualListRender(virtualList);
  });
}

function rebuildVirtualListOffsets(virtualList) {
  const offsets = new Array(virtualList.items.length + 1);
  offsets[0] = 0;
  virtualList.items.forEach((item, index) => {
    const height = virtualList.sizes.get(item.key) || item.estimatedHeight || virtualList.estimatedItemHeight;
    offsets[index + 1] = offsets[index] + height;
  });
  virtualList.offsets = offsets;
}

function virtualListIndexAt(offsets, position) {
  let low = 0;
  let high = Math.max(0, offsets.length - 2);
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (offsets[middle + 1] <= position) {
      low = middle + 1;
    } else if (offsets[middle] > position) {
      high = middle - 1;
    } else {
      return middle;
    }
  }
  return Math.min(low, Math.max(0, offsets.length - 2));
}

function virtualListAnchor(virtualList) {
  if (!virtualList.container || !virtualList.items.length) {
    return null;
  }
  const totalHeight = virtualList.offsets[virtualList.offsets.length - 1] || 0;
  const maxScrollTop = Math.max(0, totalHeight - virtualList.container.clientHeight);
  const stickToBottom = maxScrollTop > 0 && virtualList.container.scrollTop >= maxScrollTop - 2;
  const index = virtualListIndexAt(virtualList.offsets, virtualList.container.scrollTop);
  return {
    key: virtualList.items[index]?.key || "",
    offset: virtualList.container.scrollTop - virtualList.offsets[index],
    bottomOffset: totalHeight - (virtualList.container.scrollTop + virtualList.container.clientHeight),
    stickToBottom,
  };
}

function restoreVirtualListAnchor(virtualList, anchor) {
  if (!anchor?.key || !virtualList.container) {
    return;
  }
  if (anchor.stickToBottom) {
    const totalHeight = virtualList.offsets[virtualList.offsets.length - 1] || 0;
    virtualList.container.scrollTop = Math.max(0, totalHeight - virtualList.container.clientHeight - Math.max(0, anchor.bottomOffset || 0));
    return;
  }
  const index = virtualList.indexByKey.get(anchor.key);
  if (index !== undefined) {
    virtualList.container.scrollTop = Math.max(0, virtualList.offsets[index] + anchor.offset);
  }
}

function scheduleVirtualListRender(virtualList) {
  if (virtualList.frame) {
    return;
  }
  virtualList.frame = requestAnimationFrame(() => {
    virtualList.frame = 0;
    virtualList.lastRenderAt = performance.now();
    renderVirtualListWindow(virtualList);
  });
}

function scheduleVirtualListThrottledRender(virtualList) {
  const elapsed = performance.now() - (virtualList.lastRenderAt || 0);
  if (elapsed >= VIRTUAL_LIST_RENDER_THROTTLE_MS) {
    scheduleVirtualListRender(virtualList);
    return;
  }
  if (virtualList.renderThrottleTimer) {
    return;
  }
  virtualList.renderThrottleTimer = setTimeout(() => {
    virtualList.renderThrottleTimer = 0;
    scheduleVirtualListRender(virtualList);
  }, Math.max(0, VIRTUAL_LIST_RENDER_THROTTLE_MS - elapsed));
}

function renderVirtualListWindow(virtualList) {
  const { container, items, offsets } = virtualList;
  if (!container || !items.length || !virtualList.renderItem) {
    return;
  }
  const viewportHeight = Math.max(container.clientHeight, 1);
  const overscan = Math.max(500, viewportHeight);
  const start = virtualListIndexAt(offsets, Math.max(0, container.scrollTop - overscan));
  const end = Math.min(items.length, virtualListIndexAt(offsets, container.scrollTop + viewportHeight + overscan) + 1);
  const fragment = document.createDocumentFragment();
  const topSpacer = document.createElement("div");
  topSpacer.className = "virtual-list-spacer";
  topSpacer.style.height = `${offsets[start]}px`;
  fragment.append(topSpacer);
  for (let index = start; index < end; index += 1) {
    const item = items[index];
    const row = document.createElement("div");
    row.className = "virtual-list-row";
    row.dataset.virtualKey = item.key;
    if (item.sizeCacheKey) {
      row.dataset.virtualSizeKey = item.sizeCacheKey;
    }
    row.append(virtualList.renderItem(item.value));
    fragment.append(row);
  }
  const bottomSpacer = document.createElement("div");
  bottomSpacer.className = "virtual-list-spacer";
  bottomSpacer.style.height = `${Math.max(0, offsets[offsets.length - 1] - offsets[end])}px`;
  fragment.append(bottomSpacer);
  virtualList.resizeObserver?.disconnect();
  container.replaceChildren(fragment);
  container.querySelectorAll(".virtual-list-row").forEach((row) => virtualList.resizeObserver?.observe(row));
  virtualList.onRangeChange?.({
    start,
    end,
    visibleStart: virtualListIndexAt(offsets, container.scrollTop),
    visibleEnd: Math.min(items.length, virtualListIndexAt(offsets, container.scrollTop + viewportHeight) + 1),
    items: items.slice(start, end).map((item) => item.value),
  });
}

function renderVirtualList(container, virtualList, items, options) {
  initializeVirtualList(virtualList, container);
  const preservedAnchor = virtualList.resetToken === options.resetToken
    && !virtualListIsActivelyScrolling(virtualList)
    ? virtualListAnchor(virtualList)
    : null;
  if (virtualList.renderThrottleTimer) {
    clearTimeout(virtualList.renderThrottleTimer);
    virtualList.renderThrottleTimer = 0;
  }
  if (virtualList.resizeFrame) {
    cancelAnimationFrame(virtualList.resizeFrame);
    virtualList.resizeFrame = 0;
    virtualList.pendingResizeAnchor = null;
  }
  if (virtualList.resizeThrottleTimer) {
    clearTimeout(virtualList.resizeThrottleTimer);
    virtualList.resizeThrottleTimer = 0;
  }
  if (virtualList.resizeIdleTimer) {
    clearTimeout(virtualList.resizeIdleTimer);
    virtualList.resizeIdleTimer = 0;
  }
  virtualList.pendingSizeUpdates.clear();
  container.classList.add("virtualized-list");
  const resetScroll = virtualList.resetToken !== options.resetToken;
  virtualList.resetToken = options.resetToken;
  virtualList.renderItem = options.renderItem;
  virtualList.onRangeChange = typeof options.onRangeChange === "function" ? options.onRangeChange : null;
  const previousSizeCacheKeys = virtualList.sizeCacheKeys;
  const nextSizeCacheKeys = new Map();
  virtualList.items = items.map((value) => {
    const key = String(options.getKey(value));
    const estimatedHeight = options.getEstimatedHeight?.(value) || virtualList.estimatedItemHeight;
    const rawSizeCacheKey = String(options.getSizeCacheKey?.(value, key) || `${options.resetToken}|${key}|${estimatedHeight}`);
    const sizeCacheKey = virtualListSizeCacheKey(virtualList, rawSizeCacheKey, container);
    nextSizeCacheKeys.set(key, sizeCacheKey);
    const previousSizeCacheKey = previousSizeCacheKeys.get(key);
    if (previousSizeCacheKey !== sizeCacheKey) {
      virtualList.sizes.delete(key);
      virtualList.pendingSizeUpdates.delete(key);
    }
    const cachedHeight = cachedVirtualListHeight(virtualList, sizeCacheKey);
    if (cachedHeight && (!virtualList.sizes.get(key) || previousSizeCacheKey !== sizeCacheKey)) {
      virtualList.sizes.set(key, cachedHeight);
    }
    return {
      key,
      estimatedHeight,
      rawSizeCacheKey,
      sizeCacheKey,
      value,
    };
  });
  virtualList.sizeCacheKeys = nextSizeCacheKeys;
  virtualList.indexByKey = new Map(virtualList.items.map((item, index) => [item.key, index]));
  if (resetScroll) {
    virtualList.sizes.clear();
    virtualList.pendingSizeUpdates.clear();
    refreshVirtualListCachedSizes(virtualList);
  }
  rebuildVirtualListOffsets(virtualList);
  if (resetScroll) {
    container.scrollTop = 0;
  }
  clampVirtualListScroll(virtualList);
  restoreVirtualListAnchor(virtualList, preservedAnchor);
  renderVirtualListWindow(virtualList);
}

function renderVirtualListEmpty(container, virtualList, content) {
  initializeVirtualList(virtualList, container);
  if (virtualList.renderThrottleTimer) {
    clearTimeout(virtualList.renderThrottleTimer);
    virtualList.renderThrottleTimer = 0;
  }
  if (virtualList.resizeFrame) {
    cancelAnimationFrame(virtualList.resizeFrame);
    virtualList.resizeFrame = 0;
    virtualList.pendingResizeAnchor = null;
  }
  if (virtualList.resizeThrottleTimer) {
    clearTimeout(virtualList.resizeThrottleTimer);
    virtualList.resizeThrottleTimer = 0;
  }
  if (virtualList.resizeIdleTimer) {
    clearTimeout(virtualList.resizeIdleTimer);
    virtualList.resizeIdleTimer = 0;
  }
  virtualList.pendingSizeUpdates.clear();
  virtualList.resizeObserver?.disconnect();
  virtualList.items = [];
  virtualList.onRangeChange = null;
  virtualList.indexByKey.clear();
  virtualList.sizeCacheKeys.clear();
  virtualList.offsets = [0];
  container.classList.remove("virtualized-list");
  container.replaceChildren(content);
}

function scrollVirtualListItemIntoView(virtualList, key, behavior = "smooth") {
  const index = virtualList.indexByKey.get(key);
  const container = virtualList.container;
  if (index === undefined || !container) {
    return false;
  }
  const start = virtualList.offsets[index];
  const end = virtualList.offsets[index + 1];
  const viewportStart = container.scrollTop;
  const viewportEnd = viewportStart + container.clientHeight;
  let top = viewportStart;
  if (start < viewportStart) {
    top = start;
  } else if (end > viewportEnd) {
    top = Math.max(0, end - container.clientHeight);
  }
  if (top !== viewportStart) {
    container.scrollTo({ top, behavior });
  }
  scheduleVirtualListRender(virtualList);
  return true;
}

function virtualListNearestScrollTop(virtualList, index) {
  const container = virtualList.container;
  if (!container) {
    return 0;
  }
  const start = virtualList.offsets[index];
  const end = virtualList.offsets[index + 1];
  const viewportStart = container.scrollTop;
  const viewportEnd = viewportStart + container.clientHeight;
  if (start < viewportStart) {
    return start;
  }
  if (end > viewportEnd) {
    return Math.max(0, end - container.clientHeight);
  }
  return viewportStart;
}

function virtualListRowForKey(container, key) {
  return [...container.querySelectorAll(".virtual-list-row")]
    .find((row) => row.dataset.virtualKey === key) || null;
}

function scrollVirtualListItemIntoViewStable(virtualList, key, options = {}) {
  const index = virtualList.indexByKey.get(key);
  const container = virtualList.container;
  if (index === undefined || !container) {
    return false;
  }
  const top = virtualListNearestScrollTop(virtualList, index);
  if (Math.abs(container.scrollTop - top) > 0.5) {
    container.scrollTop = top;
  }
  clampVirtualListScroll(virtualList);
  renderVirtualListWindow(virtualList);
  stabilizeVirtualListItemScroll(virtualList, key, options);
  return true;
}

function stabilizeVirtualListItemScroll(virtualList, key, options = {}) {
  const maxAttempts = options.maxAttempts ?? 8;
  const attempt = options.attempt ?? 0;
  if (attempt >= maxAttempts || (options.isCurrent && !options.isCurrent())) {
    return;
  }
  requestAnimationFrame(() => {
    if (options.isCurrent && !options.isCurrent()) {
      return;
    }
    const container = virtualList.container;
    const index = virtualList.indexByKey.get(key);
    if (!container || index === undefined) {
      return;
    }
    const row = virtualListRowForKey(container, key);
    if (row) {
      const rowRect = row.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      let delta = 0;
      if (rowRect.top < containerRect.top) {
        delta = rowRect.top - containerRect.top;
      } else if (rowRect.bottom > containerRect.bottom) {
        delta = rowRect.bottom - containerRect.bottom;
      }
      if (Math.abs(delta) > 0.5) {
        container.scrollTop += delta;
        clampVirtualListScroll(virtualList);
      }
    } else {
      const top = virtualListNearestScrollTop(virtualList, index);
      if (Math.abs(container.scrollTop - top) > 0.5) {
        container.scrollTop = top;
        clampVirtualListScroll(virtualList);
      }
    }
    renderVirtualListWindow(virtualList);
    stabilizeVirtualListItemScroll(virtualList, key, {
      ...options,
      attempt: attempt + 1,
    });
  });
}

function setupMasonryLayout(container, itemSelector, itemGap) {
  if (!container) {
    return;
  }
  let layout = masonryLayouts.get(container);
  if (!layout) {
    layout = {
      frame: 0,
      itemGap,
      itemSelector,
      observer: typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => scheduleMasonryLayout(container)),
    };
    masonryLayouts.set(container, layout);
  }
  layout.itemGap = itemGap;
  layout.itemSelector = itemSelector;
  container.classList.add("masonry-layout");
  layout.observer?.disconnect();
  layout.observer?.observe(container);
  masonryLayoutItems(container, itemSelector).forEach((item) => {
    item.classList.add("masonry-item");
    layout.observer?.observe(item);
  });
  scheduleMasonryLayout(container);
}

function masonryLayoutItems(container, itemSelector) {
  return [...container.children].filter((item) => item.matches(itemSelector));
}

function scheduleMasonryLayout(container) {
  const layout = masonryLayouts.get(container);
  if (!layout || layout.frame) {
    return;
  }
  layout.frame = requestAnimationFrame(() => {
    layout.frame = 0;
    updateMasonryLayout(container);
  });
}

function updateMasonryLayout(container) {
  const layout = masonryLayouts.get(container);
  if (!layout || !container.getClientRects().length) {
    return;
  }
  const rowHeight = Number.parseFloat(getComputedStyle(container).gridAutoRows);
  const rowGap = Number.parseFloat(getComputedStyle(container).rowGap) || 0;
  if (!Number.isFinite(rowHeight) || rowHeight <= 0) {
    return;
  }
  masonryLayoutItems(container, layout.itemSelector).forEach((item) => {
    const height = item.getBoundingClientRect().height;
    const span = Math.max(1, Math.ceil((height + layout.itemGap) / (rowHeight + rowGap)));
    item.style.gridRowEnd = `span ${span}`;
  });
}

function disconnectMasonryLayoutsWithin(root) {
  root?.querySelectorAll(".masonry-layout").forEach((container) => {
    const layout = masonryLayouts.get(container);
    if (layout?.frame) {
      cancelAnimationFrame(layout.frame);
    }
    layout?.observer?.disconnect();
    masonryLayouts.delete(container);
  });
}

function setupAnalysisMasonryLayouts() {
  elements.analysisPanel.querySelectorAll(
    ".analysis-grid:not(.analysis-summary-grid), .analysis-detail-grid, .analysis-wide-grid",
  ).forEach((container) => setupMasonryLayout(container, ".analysis-card", 14));
}

function setupQualityMasonryLayouts() {
  elements.qualityPanel.querySelectorAll(
    ".analysis-grid:not(.analysis-summary-grid), .analysis-detail-grid, .analysis-wide-grid",
  ).forEach((container) => setupMasonryLayout(container, ".analysis-card", 14));
}

function renderEntries() {
  const dictionary = activeDictionary();
  if (!dictionary) {
    finishStaleContentUpdate("list");
    entryListHasSettledContent = false;
    renderVirtualListEmpty(elements.entryList, entryVirtualList, emptyState(t("noDictionary"), t("emptyDictionaryBody")));
    return;
  }

  if (!advancedFilter && rootMode) {
    renderRootModeEntries();
    return;
  }

  if (!advancedFilter && entryQueryCanUseApi(dictionary)) {
    startEntryQueryApiCheck(dictionary);
    const queryPages = entryQueryWindowForRender(dictionary);
    if (!queryPages) {
      if (entryQueryState.status === "loading") {
        if (staleContentUpdateRetainsContent("list")) {
          return;
        }
        entryListHasSettledContent = false;
        renderVirtualListEmpty(elements.entryList, entryVirtualList, emptyState(aText("加载中", "Loading"), ""));
        return;
      }
      finishStaleContentUpdate("list");
      entryListHasSettledContent = false;
      renderVirtualListEmpty(
        elements.entryList,
        entryVirtualList,
        emptyState(aText("无法加载词条列表", "Could not load entries"), aText("请刷新或稍后重试。", "Refresh or try again later.")),
      );
      return;
    }
    renderEntryRows(entryQueryState.items, {
      pageInfo: entryQueryState.pageInfo,
      windowPages: queryPages,
      onRangeChange: (range) => handleEntryQueryWindowRange(dictionary, range),
    });
    finishStaleContentUpdate("list");
    entryListHasSettledContent = true;
    return;
  }

  finishStaleContentUpdate("list");
  const entries = filteredEntries();
  renderEntryRows(entries);
  entryListHasSettledContent = true;
}

function renderEntryRows(entries = [], options = {}) {
  const windowPages = Array.isArray(options.windowPages) ? options.windowPages : null;
  if (!entries.length && !windowPages?.some((page) => page.status !== "success" || page.items.length)) {
    renderVirtualListEmpty(elements.entryList, entryVirtualList, emptyState(t("noMatch"), t("noMatchBody")));
    return;
  }

  const rows = windowPages
    ? windowPages.flatMap((page) => page.status === "success"
      ? page.items.map((entry) => ({
        kind: "entry",
        entry,
        qualityIssues: advancedFilterIssuesForEntry(entry.id),
        windowPageIndex: page.index,
        windowEstimateScale: page.estimateScale || 1,
      }))
      : [{
        kind: "window-placeholder",
        windowPageIndex: page.index,
        status: page.status,
        estimatedHeight: Math.max(page.estimatedHeight || entryVirtualList.estimatedItemHeight, entryVirtualList.estimatedItemHeight),
      }])
    : entries.map((entry) => ({
      kind: "entry",
      entry,
      qualityIssues: advancedFilterIssuesForEntry(entry.id),
    }));
  if (!windowPages && options.pageInfo?.hasMore) {
    rows.push({
      kind: "truncation",
      loaded: entries.length,
      total: options.pageInfo.total,
      messageKey: "entryResultsTruncated",
    });
  }
  const settingsSizeSignature = entryCardSettingsSizeSignature();
  renderVirtualList(elements.entryList, entryVirtualList, rows, {
    resetToken: entryVirtualResetToken(),
    getKey: (row) => row.kind === "truncation"
      ? `truncation:entries:${row.loaded}:${row.total}`
      : row.kind === "window-placeholder"
        ? `window-placeholder:entries:${row.windowPageIndex}`
      : `entry:${row.entry.id}`,
    getEstimatedHeight: (row) => row.kind === "truncation"
      ? 44
      : row.kind === "window-placeholder"
        ? row.estimatedHeight
      : estimateEntryCardHeight(row.entry, { qualityIssues: row.qualityIssues }) * (row.windowEstimateScale || 1),
    getSizeCacheKey: (row) => row.kind === "truncation"
      ? `truncation:entries:${currentLanguage}:${row.loaded}:${row.total}`
      : row.kind === "window-placeholder"
        ? `window-placeholder:entries:${row.windowPageIndex}:${Math.round(row.estimatedHeight)}`
      : entryCardSizeCacheKey(row.entry, {
        qualityIssues: row.qualityIssues,
        role: "entry",
        settingsSizeSignature,
      }),
    renderItem: (row) => row.kind === "truncation"
      ? renderEntryQueryTruncationNotice(row)
      : row.kind === "window-placeholder"
        ? renderQueryWindowPlaceholder(row)
      : createEntryCard(row.entry, { qualityIssues: row.qualityIssues }),
    onRangeChange: options.onRangeChange,
  });
}

function renderQueryWindowPlaceholder(row) {
  const placeholder = document.createElement("div");
  placeholder.className = "query-window-placeholder";
  placeholder.style.height = `${Math.max(row.estimatedHeight || 0, entryVirtualList.estimatedItemHeight)}px`;
  placeholder.setAttribute("role", "status");
  placeholder.textContent = row.status === "loading" ? aText("加载中", "Loading") : "";
  return placeholder;
}

function renderRootModeEntries() {
  const dictionary = activeDictionary();
  startRootGroupsQueryApiCheck(dictionary);
  const groupPages = rootGroupsQueryForRender(dictionary);
  if (!groupPages) {
    if (rootGroupsQueryState.status === "loading") {
      if (staleContentUpdateRetainsContent("list")) {
        return;
      }
      entryListHasSettledContent = false;
      renderVirtualListEmpty(elements.entryList, entryVirtualList, emptyState(aText("加载中", "Loading"), ""));
      return;
    }
    finishStaleContentUpdate("list");
    entryListHasSettledContent = false;
    renderVirtualListEmpty(
      elements.entryList,
      entryVirtualList,
      emptyState(aText("无法加载词根模式", "Could not load root mode"), aText("请刷新或稍后重试。", "Refresh or try again later.")),
    );
    return;
  }
  renderRootModeGroups(rootGroupsQueryState.groups, {
    pageInfo: rootGroupsQueryState.pageInfo,
    windowPages: groupPages,
    onRangeChange: (range) => handleRootGroupsWindowRange(dictionary, range),
  });
  finishStaleContentUpdate("list");
  entryListHasSettledContent = true;
}

function renderRootModeGroups(groups = [], options = {}) {
  const windowPages = Array.isArray(options.windowPages) ? options.windowPages : null;
  if (!groups.length && !windowPages?.some((page) => page.status !== "success" || page.items.length)) {
    renderVirtualListEmpty(elements.entryList, entryVirtualList, emptyState(t("noMatch"), t("noMatchBody")));
    return;
  }

  const rows = [];
  const dictionary = activeDictionary();
  const appendGroupRows = (group, windowPageIndex = null, windowEstimateScale = 1) => {
    const expanded = rootGroupIsExpanded(group);
    rows.push({ kind: "root", group, expanded, windowPageIndex, windowEstimateScale });
    if (expanded) {
      const derivedState = rootGroupDerivedState(dictionary, group.root.id);
      if (derivedState?.status === "success") {
        derivedState.items.forEach((entry) => rows.push({
          kind: "derived",
          entry,
          rootId: group.root.id,
          windowPageIndex,
        }));
      } else {
        rows.push({
          kind: "derived-placeholder",
          rootId: group.root.id,
          windowPageIndex,
          status: derivedState?.status || "idle",
          estimatedHeight: Math.max(44, group.derivedCount * 116) * (windowEstimateScale || 1),
        });
      }
    }
  };
  if (windowPages) {
    windowPages.forEach((page) => {
      if (page.status === "success") {
        page.items.forEach((group) => appendGroupRows(group, page.index, page.estimateScale || 1));
      } else {
        rows.push({
          kind: "window-placeholder",
          windowPageIndex: page.index,
          status: page.status,
          estimatedHeight: Math.max(page.estimatedHeight || 156, 156),
        });
      }
    });
  } else {
    groups.forEach((group) => appendGroupRows(group));
  }
  if (!windowPages && options.pageInfo?.hasMore) {
    rows.push({
      kind: "truncation",
      loaded: groups.length,
      total: options.pageInfo.total,
      messageKey: "rootGroupsTruncated",
    });
  }
  const settingsSizeSignature = entryCardSettingsSizeSignature();
  renderVirtualList(elements.entryList, entryVirtualList, rows, {
    resetToken: entryVirtualResetToken(),
    getKey: (row) => row.kind === "truncation"
      ? `truncation:${row.truncationScope || "root-groups"}:${row.loaded}:${row.total}`
      : row.kind === "window-placeholder"
        ? `window-placeholder:root-groups:${row.windowPageIndex}`
      : row.kind === "derived-placeholder"
        ? `derived-status:${row.rootId}:${row.status}`
      : row.kind === "root"
        ? `root:${row.group.root.id}`
        : `derived:${row.rootId}:${row.entry.id}`,
    getEstimatedHeight: (row) => row.kind === "window-placeholder"
      ? row.estimatedHeight
      : row.kind === "derived-placeholder"
        ? row.estimatedHeight
      : row.kind === "truncation"
        ? 44
        : (row.kind === "root" ? 156 : 116) * (row.windowEstimateScale || 1),
    getSizeCacheKey: (row) => row.kind === "truncation"
      ? `truncation:root-groups:${currentLanguage}:${row.loaded}:${row.total}`
      : row.kind === "window-placeholder"
        ? `window-placeholder:root-groups:${row.windowPageIndex}:${Math.round(row.estimatedHeight)}`
      : row.kind === "derived-placeholder"
        ? `derived-status:${currentLanguage}:${row.rootId}:${row.status}:${Math.round(row.estimatedHeight)}`
      : row.kind === "root"
      ? entryCardSizeCacheKey(row.group.root, {
        role: "root",
        expanded: row.expanded,
        derivedCount: row.group.derivedCount,
        settingsSizeSignature,
      })
      : entryCardSizeCacheKey(row.entry, { role: "derived", rootId: row.rootId, settingsSizeSignature }),
    renderItem: (row) => row.kind === "window-placeholder"
      ? renderQueryWindowPlaceholder(row)
      : renderRootModeRow(row),
    onRangeChange: options.onRangeChange,
  });
}

function entryVirtualResetToken() {
  return [
    state.activeDictionaryId,
    rootMode ? "root" : "entries",
    normalizeEntrySearchText(searchQuery),
    activePart,
    entrySort,
    entryQueryState.status === "success" ? "api" : "local",
    rootGroupsQueryState.status === "success" ? "root-api" : "root-local",
    advancedFilter?.title || "",
    advancedFilter?.variantIndex ?? "",
  ].join("|");
}

function virtualListSignaturePart(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function entryCardSettingsSizeSignature() {
  const settings = normalizeDictionarySettings(activeDictionary()?.settings);
  return [
    currentLanguage,
    settings.entryListPolysemyDisplay,
    settings.entryListTagDisplayLimit,
    settings.entryListPartDisplay,
    settings.entryListRawTagDisplay ? "raw-tags" : "display-tags",
    settings.entryListTagFiltering ? "tag-filtering" : "no-tag-filtering",
    entrySearchQuerySignature(),
    settings.manualPartOfSpeechTags ? "manual-parts" : "first-tag-part",
    settings.partOfSpeechTags.join(","),
    stableJson(settings.tagDisplayMap),
    stableJson(settings.redHighlightTags),
  ].map(virtualListSignaturePart).join(";");
}

function entryCardContentSizeSignature(entry) {
  return [
    entry.id,
    entry.updatedAt,
    entry.lemma,
    entry.pronunciation,
    entryPartText(entry),
    (entry.tags || []).join(","),
    entryDefinitionItems(entry).map((definition) => [
      definition.id,
      definition.meaning,
      definition.example,
      definition.note,
    ].map(virtualListSignaturePart).join("~")).join("^"),
  ].map(virtualListSignaturePart).join(";");
}

function entryCardSizeCacheKey(entry, options = {}) {
  const issueSignature = (options.qualityIssues || [])
    .map((issue) => [
      issue.type,
      issue.priority,
      issue.module,
      issue.title,
    ].map(virtualListSignaturePart).join("~"))
    .join("^");
  return [
    "entry-card",
    state.activeDictionaryId,
    rootMode ? "root-mode" : "entry-mode",
    normalizeEntrySearchText(searchQuery),
    activePart,
    advancedFilter?.title || "",
    advancedFilter?.variantIndex ?? "",
    options.role || "entry",
    options.rootId || "",
    options.expanded ? "expanded" : "collapsed",
    options.derivedCount ?? "",
    options.settingsSizeSignature || entryCardSettingsSizeSignature(),
    entryCardContentSizeSignature(entry),
    issueSignature,
  ].map(virtualListSignaturePart).join("|");
}

function rootGroupsQueryCanUseApi(dictionary = activeDictionary()) {
  return Boolean(
    backendAvailable
    && dictionary
    && rootMode
    && !advancedFilter
  );
}

function rootGroupsQueryApiKey(dictionary = activeDictionary()) {
  if (!dictionary) {
    return "";
  }
  return [
    dictionary.id,
    dictionary.updatedAt || "",
    normalizeEntrySearchText(searchQuery, dictionary),
    entrySort,
    entrySearchQuerySignature(dictionary),
  ].join("|");
}

function queryPageCacheKey(kind, key) {
  return `${kind}\u0000${key}`;
}

function createQueryWindowPage(cursor = "", index = 0, status = "loading") {
  return {
    index,
    offset: 0,
    cursor: String(cursor || ""),
    status,
    items: [],
    pageInfo: null,
    error: null,
    estimatedHeight: 0,
    estimateScale: 1,
    windowMetric: null,
    lastAccessAt: performance.now(),
  };
}

function rootSearchExpandsGroups() {
  return Boolean(normalizeEntrySearchText(searchQuery));
}

function rootGroupDerivedCount(group) {
  return Math.max(
    0,
    Number(group?.derivedCount) || (Array.isArray(group?.derived) ? group.derived.length : 0),
  );
}

function rootGroupMatchedDerivedCount(group) {
  return Math.max(
    0,
    Number(group?.matchedDerivedCount) || (Array.isArray(group?.matchedDerived) ? group.matchedDerived.length : 0),
  );
}

function rootGroupIsExpanded(group) {
  const rootId = group?.root?.id || "";
  if (!rootId || !rootGroupDerivedCount(group)) {
    return false;
  }
  if (rootSearchExpandsGroups() && rootGroupMatchedDerivedCount(group)) {
    return true;
  }
  if (rootExpansionMode === "all") {
    return !collapsedRootEntries.has(rootId);
  }
  return expandedRootEntries.has(rootId);
}

function rootGroupEstimatedHeight(group) {
  const rootHeight = 156;
  const derivedHeight = rootGroupIsExpanded(group)
    ? rootGroupDerivedCount(group) * 116
    : 0;
  return rootHeight + derivedHeight;
}

function rootGroupWindowMetricHeight(metric = {}) {
  const groupCount = Math.max(0, Number(metric.groupCount) || 0);
  const derivedCount = Math.max(0, Number(metric.derivedCount) || 0);
  const includeDerived = rootExpansionMode === "all" || rootSearchExpandsGroups();
  return (groupCount * 156) + (includeDerived ? derivedCount * 116 : 0);
}

function applyRootGroupWindowMetrics(state, pageInfo = null) {
  const metrics = Array.isArray(pageInfo?.windowMetrics) ? pageInfo.windowMetrics : [];
  metrics.forEach((metric, index) => {
    const page = state.pages[index];
    if (!page) {
      return;
    }
    page.windowMetric = metric;
    if (page.status !== "success") {
      page.estimatedHeight = rootGroupWindowMetricHeight(metric);
      page.estimateScale = 1;
    }
  });
}

function refreshRootGroupWindowHeightEstimates() {
  rootGroupsQueryState.pages.forEach((page) => {
    page.estimateScale = 1;
    if (page.status !== "success" && page.windowMetric) {
      page.estimatedHeight = rootGroupWindowMetricHeight(page.windowMetric);
    }
  });
}

function resetRootExpansionState() {
  rootExpansionMode = "manual";
  expandedRootEntries.clear();
  collapsedRootEntries.clear();
  rootGroupDerivedStates.clear();
  refreshRootGroupWindowHeightEstimates();
}

function preserveQueryWindowPageHeight(page, naturalHeight, hasWindowCursor) {
  const safeNaturalHeight = Math.max(0, Number(naturalHeight) || 0);
  const reservedHeight = Math.max(0, Number(page.estimatedHeight) || 0);
  if (hasWindowCursor && reservedHeight > 0 && safeNaturalHeight > 0) {
    page.estimateScale = reservedHeight / safeNaturalHeight;
    return;
  }
  page.estimatedHeight = safeNaturalHeight;
  page.estimateScale = 1;
}

function queryWindowLoadedItems(pages = []) {
  return pages.flatMap((page) => page.status === "success" ? page.items : []);
}

function queryWindowAggregatePageInfo(pages = []) {
  const successfulPage = [...pages].reverse().find((page) => page.pageInfo);
  return successfulPage ? {
    ...successfulPage.pageInfo,
    hasMore: pages.some((page) => page.status !== "success"),
  } : null;
}

function populateQueryWindowPages(state, firstPage, pageSize, estimatedItemHeight) {
  if (firstPage.index !== 0 || state.pages.length !== 1 || !firstPage.pageInfo) {
    return;
  }
  const total = Math.max(0, Number(firstPage.pageInfo.total) || 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  state.windowCursor = firstPage.pageInfo.windowCursor || "";
  for (let index = 1; index < pageCount; index += 1) {
    const page = createQueryWindowPage(state.windowCursor, index, "unloaded");
    page.offset = index * pageSize;
    page.estimatedHeight = Math.min(pageSize, total - page.offset) * estimatedItemHeight;
    state.pages.push(page);
  }
}

function queryWindowPageHeight(virtualList, pageIndex, fallback = 0) {
  const matching = virtualList.items.filter((item) => item.value?.windowPageIndex === pageIndex);
  if (!matching.length) {
    return fallback;
  }
  return matching.reduce((total, item) => (
    total + (virtualList.sizes.get(item.key) || item.estimatedHeight || virtualList.estimatedItemHeight)
  ), 0);
}

function evictDistantQueryWindowPages(
  pages,
  virtualList,
  activePageIndexes = new Set(),
  protectedEntryId = "",
  options = {},
) {
  const loaded = pages.filter((page) => page.status === "success");
  if (loaded.length <= QUERY_WINDOW_MAX_LOADED_PAGES) {
    return false;
  }
  const activeIndexes = activePageIndexes.size ? [...activePageIndexes] : [loaded[loaded.length - 1].index];
  const activeCenter = activeIndexes.reduce((sum, index) => sum + index, 0) / activeIndexes.length;
  const protectedIds = protectedEntryId instanceof Set
    ? protectedEntryId
    : new Set([protectedEntryId].filter(Boolean));
  const candidates = loaded
    .filter((page) => !activePageIndexes.has(page.index))
    .filter((page) => !page.items.some((item) => protectedIds.has(item.id || item.root?.id)))
    .sort((left, right) => Math.abs(right.index - activeCenter) - Math.abs(left.index - activeCenter));
  let remaining = loaded.length;
  let changed = false;
  for (const page of candidates) {
    if (remaining <= QUERY_WINDOW_MAX_LOADED_PAGES) {
      break;
    }
    page.estimatedHeight = queryWindowPageHeight(virtualList, page.index, page.estimatedHeight);
    options.onEvict?.(page);
    page.items = [];
    page.status = "evicted";
    page.error = null;
    remaining -= 1;
    changed = true;
  }
  return changed;
}

function compactRootGroupsQueryResult(result) {
  const groups = Array.isArray(result?.items)
    ? result.items.map((group) => ({
      root: group.root || null,
      derivedCount: Math.max(0, Number(group.derivedCount) || 0),
      matchedDerivedCount: Math.max(0, Number(group.matchedDerivedCount) || 0),
      rootMatches: Boolean(group.rootMatches),
    })).filter((group) => group.root?.id)
    : [];
  return {
    groups,
    pageInfo: result?.pageInfo ? {
      ...result.pageInfo,
      windowMetrics: Array.isArray(result.pageInfo.windowMetrics)
        ? result.pageInfo.windowMetrics.map((metric) => ({
          groupCount: Math.max(0, Number(metric?.groupCount) || 0),
          derivedCount: Math.max(0, Number(metric?.derivedCount) || 0),
        }))
        : [],
    } : null,
  };
}

function resetRootGroupsQueryState() {
  rootGroupsQueryState = {
    key: "",
    status: "idle",
    groups: [],
    pageInfo: null,
    error: null,
    requestId: rootGroupsQueryState.requestId + 1,
    pages: [],
    visiblePageIndexes: new Set(),
    windowCursor: "",
    updateToken: 0,
  };
  rootGroupDerivedStates.clear();
}

function rootGroupsQueryParams(dictionary) {
  const params = new URLSearchParams();
  if (searchQuery.trim()) {
    params.set("q", searchQuery.trim());
  }
  if (entrySort) {
    params.set("sort", entrySort);
  }
  const { fields, fuzzyFields } = entrySearchQueryOptions(dictionary);
  params.set("fields", [...fields].join(","));
  if (fuzzyFields.size) {
    params.set("fuzzyFields", [...fuzzyFields].join(","));
  }
  params.set("include", "summary");
  return params;
}

function rootGroupsQueryUrl(dictionary, options = {}) {
  const params = rootGroupsQueryParams(dictionary);
  params.set("limit", String(ROOT_GROUP_QUERY_WINDOW_PAGE_SIZE));
  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });
  return `/api/dictionaries/${encodeURIComponent(dictionary.id)}/root-groups?${params}`;
}

function rootGroupsLocationUrl(dictionary, entryId, options = {}) {
  const params = rootGroupsQueryParams(dictionary);
  params.set("entryId", entryId);
  params.set("limit", String(ROOT_GROUP_QUERY_WINDOW_PAGE_SIZE));
  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });
  return `/api/dictionaries/${encodeURIComponent(dictionary.id)}/root-groups/location?${params}`;
}

function rootGroupsQueryForRender(dictionary) {
  const key = rootGroupsQueryApiKey(dictionary);
  if (rootGroupsQueryState.status !== "success" || rootGroupsQueryState.key !== key) {
    return null;
  }
  return rootGroupsQueryState.pages;
}

function rootGroupDerivedStateKey(dictionary, rootId) {
  return `${rootGroupsQueryApiKey(dictionary)}\u0000${rootId}`;
}

function rootGroupDerivedUrl(dictionary, rootId) {
  const params = rootGroupsQueryParams(dictionary);
  return `/api/dictionaries/${encodeURIComponent(dictionary.id)}/root-groups/${encodeURIComponent(rootId)}/entries?${params}`;
}

function rootGroupDerivedState(dictionary, rootId) {
  return rootGroupDerivedStates.get(rootGroupDerivedStateKey(dictionary, rootId)) || null;
}

function startRootGroupDerivedLoad(dictionary, rootId) {
  const key = rootGroupDerivedStateKey(dictionary, rootId);
  const current = rootGroupDerivedStates.get(key);
  if (current && ["loading", "success", "error"].includes(current.status)) {
    return;
  }
  const requestId = (current?.requestId || 0) + 1;
  rootGroupDerivedStates.set(key, {
    status: "loading",
    items: [],
    error: null,
    requestId,
  });
  queryPageCache.load({
    key: queryPageCacheKey("root-group-entries", key),
    dictionaryId: dictionary.id,
    load: () => api(rootGroupDerivedUrl(dictionary, rootId)),
    transform: (result) => ({
      items: Array.isArray(result?.items) ? result.items.filter((entry) => entry?.id) : [],
    }),
  })
    .then((result) => {
      const active = rootGroupDerivedStates.get(key);
      if (
        active?.requestId !== requestId
        || rootGroupsQueryApiKey(activeDictionary()) !== rootGroupsQueryApiKey(dictionary)
      ) {
        return;
      }
      rootGroupDerivedStates.set(key, {
        status: "success",
        items: result.items,
        error: null,
        requestId,
      });
      renderEntries();
      flushPendingEntryCardScroll();
    })
    .catch((error) => {
      const active = rootGroupDerivedStates.get(key);
      if (active?.requestId !== requestId) {
        return;
      }
      rootGroupDerivedStates.set(key, {
        status: "error",
        items: [],
        error,
        requestId,
      });
      console.error(error);
      renderEntries();
    });
}

function syncRootGroupsQueryWindowState() {
  rootGroupsQueryState.groups = queryWindowLoadedItems(rootGroupsQueryState.pages);
  rootGroupsQueryState.pageInfo = queryWindowAggregatePageInfo(rootGroupsQueryState.pages);
}

function rootGroupsPageCacheKey(key, cursor = "") {
  return queryPageCacheKey("root-groups", `${key}\u0000${cursor}`);
}

function invalidateQueryPageCacheAfterCursorStale(dictionary) {
  if (dictionary?.id) {
    queryPageCache.invalidateDictionary(dictionary.id);
  }
}

function restartRootGroupsWindowAfterStale() {
  const selectedEntryId = state.selectedEntryId;
  const rootId = rootNavigationContextId;
  resetRootGroupsQueryState();
  renderEntries();
  if (selectedEntryId) {
    scheduleEntryCardScroll(selectedEntryId, rootId ? { rootId } : {});
  }
}

function loadRootGroupsWindowPage(dictionary, page) {
  const key = rootGroupsQueryState.key;
  const requestId = rootGroupsQueryState.requestId;
  const updateToken = rootGroupsQueryState.updateToken;
  page.status = "loading";
  page.error = null;
  page.lastAccessAt = performance.now();
  return queryPageCache.load({
    key: rootGroupsPageCacheKey(key, `${rootGroupsQueryState.windowCursor || page.cursor}\u0000${page.offset}`),
    dictionaryId: dictionary.id,
    load: () => api(rootGroupsQueryUrl(dictionary, {
      cursor: rootGroupsQueryState.windowCursor || page.cursor,
      windowOffset: rootGroupsQueryState.windowCursor ? page.offset : "",
      limit: ROOT_GROUP_QUERY_WINDOW_PAGE_SIZE,
    })),
    transform: compactRootGroupsQueryResult,
  })
    .then((result) => {
      if (
        rootGroupsQueryState.requestId !== requestId
        || rootGroupsQueryState.key !== key
        || rootGroupsQueryApiKey(activeDictionary()) !== key
        || !rootGroupsQueryState.pages.includes(page)
      ) {
        return;
      }
      page.estimatedHeight = queryWindowPageHeight(entryVirtualList, page.index, page.estimatedHeight);
      page.status = "success";
      page.items = result.groups;
      page.pageInfo = result.pageInfo;
      page.error = null;
      page.lastAccessAt = performance.now();
      populateQueryWindowPages(
        rootGroupsQueryState,
        page,
        ROOT_GROUP_QUERY_WINDOW_PAGE_SIZE,
        156,
      );
      applyRootGroupWindowMetrics(rootGroupsQueryState, result.pageInfo);
      const naturalHeight = result.groups.reduce((total, group) => total + rootGroupEstimatedHeight(group), 0);
      preserveQueryWindowPageHeight(
        page,
        naturalHeight,
        Boolean(rootGroupsQueryState.windowCursor),
      );
      rootGroupsQueryState.status = "success";
      rootGroupsQueryState.error = null;
      if (page.index === 0) {
        rootGroupsQueryState.updateToken = 0;
        finishStaleContentUpdate("list", updateToken);
      }
      syncRootGroupsQueryWindowState();
      const protectedRootIds = new Set([rootNavigationContextId, state.selectedEntryId].filter(Boolean));
      evictDistantQueryWindowPages(
        rootGroupsQueryState.pages,
        entryVirtualList,
        rootGroupsQueryState.visiblePageIndexes,
        protectedRootIds,
        {
          onEvict: (evictedPage) => {
            evictedPage.items.forEach((group) => {
              rootGroupDerivedStates.delete(rootGroupDerivedStateKey(dictionary, group.root.id));
            });
          },
        },
      );
      syncRootGroupsQueryWindowState();
      renderPartFilter();
      renderEntries();
      flushPendingEntryCardScroll();
    })
    .catch((error) => {
      if (rootGroupsQueryState.requestId !== requestId || rootGroupsQueryState.key !== key) {
        return;
      }
      if (error?.code === "query_cursor_stale") {
        invalidateQueryPageCacheAfterCursorStale(dictionary);
        restartRootGroupsWindowAfterStale();
        return;
      }
      rootGroupsQueryState = {
        key,
        status: "error",
        groups: [],
        pageInfo: null,
        error,
        requestId,
        pages: [],
        visiblePageIndexes: new Set(),
        windowCursor: "",
        updateToken: 0,
      };
      if (page.index === 0) {
        finishStaleContentUpdate("list", updateToken);
      }
      console.error(error);
      renderPartFilter();
      renderEntries();
    });
}

function handleRootGroupsWindowRange(dictionary, range) {
  if (rootGroupsQueryState.key !== rootGroupsQueryApiKey(dictionary) || rootGroupsQueryState.status !== "success") {
    return;
  }
  const visiblePageIndexes = new Set(
    range.items.map((row) => row?.windowPageIndex).filter((index) => Number.isInteger(index)),
  );
  rootGroupsQueryState.visiblePageIndexes = visiblePageIndexes;
  visiblePageIndexes.forEach((index) => {
    const page = rootGroupsQueryState.pages.find((candidate) => candidate.index === index);
    if (!page) {
      return;
    }
    page.lastAccessAt = performance.now();
    if (["unloaded", "evicted"].includes(page.status)) {
      loadRootGroupsWindowPage(dictionary, page);
    }
  });
  const adjacentPageIndexes = new Set(
    [...visiblePageIndexes].flatMap((index) => [index - 1, index + 1]).filter((index) => index >= 0),
  );
  adjacentPageIndexes.forEach((index) => {
    const page = rootGroupsQueryState.pages.find((candidate) => candidate.index === index);
    if (page?.status === "unloaded") {
      loadRootGroupsWindowPage(dictionary, page);
    }
  });
}

function startRootGroupsQueryApiCheck(dictionary) {
  if (!rootGroupsQueryCanUseApi(dictionary)) {
    if (rootGroupsQueryState.status !== "idle") {
      resetRootGroupsQueryState();
    }
    return;
  }

  const key = rootGroupsQueryApiKey(dictionary);
  if (rootGroupsQueryState.key === key && ["loading", "success", "error"].includes(rootGroupsQueryState.status)) {
    return;
  }
  if (rootGroupsQueryState.key && rootGroupsQueryState.key !== key) {
    rootGroupDerivedStates.clear();
  }

  const requestId = rootGroupsQueryState.requestId + 1;
  const updateToken = beginStaleContentUpdate("list", entryListHasSettledContent);
  const firstPage = createQueryWindowPage("", 0);
  firstPage.estimatedHeight = ROOT_GROUP_QUERY_WINDOW_PAGE_SIZE * 156;
  rootGroupsQueryState = {
    key,
    status: "loading",
    groups: [],
    pageInfo: null,
    error: null,
    requestId,
    pages: [firstPage],
    visiblePageIndexes: new Set([0]),
    windowCursor: "",
    updateToken,
  };
  loadRootGroupsWindowPage(dictionary, firstPage);
}

function entryQueryCanUseApi(dictionary = activeDictionary()) {
  return Boolean(
    backendAvailable
    && dictionary
    && !advancedFilter
    && !rootMode
  );
}

function entryQueryApiKey(dictionary = activeDictionary()) {
  if (!dictionary) {
    return "";
  }
  const settings = normalizeDictionarySettings(dictionary.settings);
  return [
    dictionary.id,
    dictionary.updatedAt || "",
    normalizeEntrySearchText(searchQuery, dictionary),
    activePart,
    entrySort,
    stableJson(settings.tagDisplayMap),
    settings.manualPartOfSpeechTags ? "manual-parts" : "first-tag-part",
    settings.partOfSpeechTags.join(","),
    entrySearchQuerySignature(dictionary),
  ].join("|");
}

function compactEntryQueryResult(result) {
  return {
    items: Array.isArray(result?.items) ? result.items.filter((entry) => entry?.id) : [],
    pageInfo: result?.pageInfo || null,
  };
}

function entrySummaryDto(entry, dictionary = activeDictionary()) {
  const parts = entryParts(entry, dictionary);
  return {
    id: entry.id,
    lemma: entry.lemma || "",
    pronunciation: entry.pronunciation || "",
    tags: Array.isArray(entry.tags) ? [...entry.tags] : [],
    definitionPreviews: (entry.definitions || []).map((definition, position) => ({
      id: definition.id || "",
      position,
      meaning: definition.meaning || "",
    })),
    createdAt: entry.createdAt || "",
    updatedAt: entry.updatedAt || "",
    partOfSpeech: parts[0] || "",
    parts,
  };
}

function updateEntrySummaryDtoAfterSave(dictionary, entry) {
  if (!dictionary || !entry?.id) {
    return;
  }
  const summary = entrySummaryDto(entry, dictionary);
  if (entryQueryState.status === "success") {
    entryQueryState.pages.forEach((page) => {
      if (page.status === "success") {
        page.items = page.items.map((item) => (
          item.id === entry.id
            ? { ...summary, ...(Array.isArray(item.searchHits) ? { searchHits: item.searchHits } : {}) }
            : item
        ));
      }
    });
    syncEntryQueryWindowState();
    if (!rootMode && !advancedFilter) {
      renderEntryRows(entryQueryState.items, {
        pageInfo: entryQueryState.pageInfo,
        windowPages: entryQueryState.pages,
        onRangeChange: (range) => handleEntryQueryWindowRange(dictionary, range),
      });
    }
  }
  rootGroupsQueryState.pages.forEach((page) => {
    if (page.status === "success") {
      page.items = page.items.map((group) => (
        group.root.id === entry.id ? { ...group, root: summary } : group
      ));
    }
  });
  syncRootGroupsQueryWindowState();
  rootGroupDerivedStates.forEach((derivedState) => {
    if (derivedState.status === "success") {
      derivedState.items = derivedState.items.map((item) => (
        item.id === entry.id ? { ...summary, rootGroupMatch: item.rootGroupMatch } : item
      ));
    }
  });
}

function resetEntryQueryState() {
  entryQueryState = {
    key: "",
    status: "idle",
    items: [],
    pageInfo: null,
    error: null,
    requestId: entryQueryState.requestId + 1,
    pages: [],
    visiblePageIndexes: new Set(),
    windowCursor: "",
    updateToken: 0,
  };
}

function entryQueryParams(dictionary) {
  const params = new URLSearchParams();
  if (searchQuery.trim()) {
    params.set("q", searchQuery.trim());
  }
  if (activePart) {
    params.set("part", activePart);
  }
  if (entrySort) {
    params.set("sort", entrySort);
  }
  const { fields, fuzzyFields } = entrySearchQueryOptions(dictionary);
  params.set("fields", [...fields].join(","));
  if (fuzzyFields.size) {
    params.set("fuzzyFields", [...fuzzyFields].join(","));
  }
  params.set("include", "summary");
  return params;
}

function entryQueryUrl(dictionary, options = {}) {
  const params = entryQueryParams(dictionary);
  params.set("limit", String(ENTRY_QUERY_WINDOW_PAGE_SIZE));
  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });
  return `/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries?${params}`;
}

function entryQueryLocationUrl(dictionary, entryId) {
  const params = entryQueryParams(dictionary);
  params.set("limit", String(ENTRY_QUERY_WINDOW_PAGE_SIZE));
  return `/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries/${encodeURIComponent(entryId)}/location?${params}`;
}

function entryQueryWindowForRender(dictionary) {
  const key = entryQueryApiKey(dictionary);
  if (entryQueryState.status !== "success" || entryQueryState.key !== key) {
    return null;
  }
  return entryQueryState.pages;
}

function syncEntryQueryWindowState() {
  entryQueryState.items = queryWindowLoadedItems(entryQueryState.pages);
  entryQueryState.pageInfo = queryWindowAggregatePageInfo(entryQueryState.pages);
}

function entryQueryPageCacheKey(key, cursor = "") {
  return queryPageCacheKey("entries", `${key}\u0000${cursor}`);
}

function restartEntryQueryWindowAfterStale(dictionary) {
  const selectedEntryId = state.selectedEntryId;
  resetEntryQueryState();
  renderEntries();
  if (selectedEntryId) {
    scheduleEntryCardScroll(selectedEntryId);
  }
}

function loadEntryQueryWindowPage(dictionary, page) {
  const key = entryQueryState.key;
  const requestId = entryQueryState.requestId;
  const updateToken = entryQueryState.updateToken;
  page.status = "loading";
  page.error = null;
  page.lastAccessAt = performance.now();
  return queryPageCache.load({
    key: entryQueryPageCacheKey(key, `${entryQueryState.windowCursor || page.cursor}\u0000${page.offset}`),
    dictionaryId: dictionary.id,
    load: () => api(entryQueryUrl(dictionary, {
      cursor: entryQueryState.windowCursor || page.cursor,
      windowOffset: entryQueryState.windowCursor ? page.offset : "",
      limit: ENTRY_QUERY_WINDOW_PAGE_SIZE,
    })),
    transform: compactEntryQueryResult,
  })
    .then((result) => {
      if (
        entryQueryState.requestId !== requestId
        || entryQueryState.key !== key
        || entryQueryApiKey(activeDictionary()) !== key
        || !entryQueryState.pages.includes(page)
      ) {
        return;
      }
      page.estimatedHeight = queryWindowPageHeight(entryVirtualList, page.index, page.estimatedHeight);
      page.status = "success";
      page.items = result.items;
      page.pageInfo = result.pageInfo;
      page.error = null;
      page.lastAccessAt = performance.now();
      preserveQueryWindowPageHeight(
        page,
        result.items.reduce((total, entry) => (
          total + estimateEntryCardHeight(entry, { qualityIssues: advancedFilterIssuesForEntry(entry.id) })
        ), 0),
        Boolean(entryQueryState.windowCursor),
      );
      populateQueryWindowPages(
        entryQueryState,
        page,
        ENTRY_QUERY_WINDOW_PAGE_SIZE,
        entryVirtualList.estimatedItemHeight,
      );
      entryQueryState.status = "success";
      entryQueryState.error = null;
      if (page.index === 0) {
        entryQueryState.updateToken = 0;
        finishStaleContentUpdate("list", updateToken);
      }
      syncEntryQueryWindowState();
      evictDistantQueryWindowPages(
        entryQueryState.pages,
        entryVirtualList,
        entryQueryState.visiblePageIndexes,
        state.selectedEntryId,
      );
      syncEntryQueryWindowState();
      renderEntries();
      flushPendingEntryCardScroll();
    })
    .catch((error) => {
      if (entryQueryState.requestId !== requestId || entryQueryState.key !== key) {
        return;
      }
      if (error?.code === "query_cursor_stale") {
        invalidateQueryPageCacheAfterCursorStale(dictionary);
        restartEntryQueryWindowAfterStale(dictionary);
        return;
      }
      entryQueryState = {
        key,
        status: "error",
        items: [],
        pageInfo: null,
        error,
        requestId,
        pages: [],
        visiblePageIndexes: new Set(),
        windowCursor: "",
        updateToken: 0,
      };
      if (page.index === 0) {
        finishStaleContentUpdate("list", updateToken);
      }
      console.error(error);
      renderEntries();
    });
}

function handleEntryQueryWindowRange(dictionary, range) {
  if (entryQueryState.key !== entryQueryApiKey(dictionary) || entryQueryState.status !== "success") {
    return;
  }
  const visiblePageIndexes = new Set(
    range.items.map((row) => row?.windowPageIndex).filter((index) => Number.isInteger(index)),
  );
  entryQueryState.visiblePageIndexes = visiblePageIndexes;
  visiblePageIndexes.forEach((index) => {
    const page = entryQueryState.pages.find((candidate) => candidate.index === index);
    if (!page) {
      return;
    }
    page.lastAccessAt = performance.now();
    if (["unloaded", "evicted"].includes(page.status)) {
      loadEntryQueryWindowPage(dictionary, page);
    }
  });
  const adjacentPageIndexes = new Set(
    [...visiblePageIndexes].flatMap((index) => [index - 1, index + 1]).filter((index) => index >= 0),
  );
  adjacentPageIndexes.forEach((index) => {
    const page = entryQueryState.pages.find((candidate) => candidate.index === index);
    if (page?.status === "unloaded") {
      loadEntryQueryWindowPage(dictionary, page);
    }
  });
}

function startEntryQueryApiCheck(dictionary) {
  if (!entryQueryCanUseApi(dictionary)) {
    if (entryQueryState.status !== "idle") {
      resetEntryQueryState();
    }
    return;
  }

  const key = entryQueryApiKey(dictionary);
  if (entryQueryState.key === key && ["loading", "success", "error"].includes(entryQueryState.status)) {
    return;
  }

  const requestId = entryQueryState.requestId + 1;
  const updateToken = beginStaleContentUpdate("list", entryListHasSettledContent);
  const firstPage = createQueryWindowPage("", 0);
  firstPage.estimatedHeight = ENTRY_QUERY_WINDOW_PAGE_SIZE * entryVirtualList.estimatedItemHeight;
  entryQueryState = {
    key,
    status: "loading",
    items: [],
    pageInfo: null,
    error: null,
    requestId,
    pages: [firstPage],
    visiblePageIndexes: new Set([0]),
    windowCursor: "",
    updateToken,
  };
  loadEntryQueryWindowPage(dictionary, firstPage);
}

function localPartTags(dictionary = activeDictionary()) {
  return dictionary
    ? [...new Set((dictionary.entries || []).flatMap((entry) => entryParts(entry, dictionary)).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "zh-CN"))
    : [];
}

function entryFacetsCanUseApi(dictionary = activeDictionary()) {
  return Boolean(backendAvailable && dictionary);
}

function entryFacetsApiKey(dictionary = activeDictionary()) {
  if (!dictionary) {
    return "";
  }
  const settings = normalizeDictionarySettings(dictionary.settings);
  return [
    dictionary.id,
    dictionary.updatedAt || "",
    stableJson(settings.tagDisplayMap),
    settings.manualPartOfSpeechTags ? "manual-parts" : "first-tag-part",
    settings.partOfSpeechTags.join(","),
  ].join("|");
}

function compactEntryFacetsResult(result) {
  return {
    parts: Array.isArray(result?.parts)
      ? result.parts.map((part) => part?.tag).filter(Boolean).sort((a, b) => a.localeCompare(b, "zh-CN"))
      : [],
  };
}

function resetEntryFacetsState() {
  entryFacetsState = {
    key: "",
    status: "idle",
    parts: [],
    error: null,
    requestId: entryFacetsState.requestId + 1,
  };
}

function entryFacetsPartsForRender(dictionary) {
  const key = entryFacetsApiKey(dictionary);
  if (entryFacetsState.status !== "success" || entryFacetsState.key !== key) {
    return null;
  }
  return entryFacetsState.parts;
}

function startEntryFacetsApiCheck(dictionary) {
  if (!entryFacetsCanUseApi(dictionary)) {
    if (entryFacetsState.status !== "idle") {
      resetEntryFacetsState();
    }
    return;
  }

  const key = entryFacetsApiKey(dictionary);
  if (entryFacetsState.key === key && ["loading", "success", "error"].includes(entryFacetsState.status)) {
    return;
  }

  const requestId = entryFacetsState.requestId + 1;
  const cacheKey = queryPageCacheKey("facets", key);
  const cached = queryPageCache.get(cacheKey);
  if (cached) {
    entryFacetsState = {
      key,
      status: "success",
      parts: cached.parts,
      error: null,
      requestId,
    };
    return;
  }
  entryFacetsState = {
    key,
    status: "loading",
    parts: [],
    error: null,
    requestId,
  };

  queryPageCache.load({
    key: cacheKey,
    dictionaryId: dictionary.id,
    load: () => api(`/api/dictionaries/${encodeURIComponent(dictionary.id)}/facets`),
    transform: compactEntryFacetsResult,
  })
    .then((result) => {
      if (entryFacetsState.requestId !== requestId || entryFacetsApiKey(activeDictionary()) !== key) {
        return;
      }
      entryFacetsState = {
        key,
        status: "success",
        parts: result.parts,
        error: null,
        requestId,
      };
      renderPartFilter();
    })
    .catch((error) => {
      if (entryFacetsState.requestId !== requestId) {
        return;
      }
      entryFacetsState = {
        key,
        status: "error",
        parts: [],
        error,
        requestId,
      };
      console.error(error);
      renderPartFilter();
    });
}

function renderRootModeRow(row) {
  if (row.kind === "truncation") {
    return renderEntryQueryTruncationNotice(row);
  }
  if (row.kind === "derived-placeholder") {
    if (row.status === "idle") {
      startRootGroupDerivedLoad(activeDictionary(), row.rootId);
    }
    const placeholder = document.createElement("div");
    placeholder.className = "entry-list-truncation-notice root-derived-placeholder";
    placeholder.style.height = `${Math.max(32, row.estimatedHeight - 12)}px`;
    placeholder.setAttribute("role", "status");
    placeholder.textContent = row.status === "error"
      ? aText("无法加载衍生词条", "Could not load derived entries")
      : aText("加载中", "Loading");
    return placeholder;
  }
  if (row.kind === "derived") {
    const wrapper = document.createElement("div");
    wrapper.className = "root-derived-list virtual-root-derived-row";
    wrapper.dataset.rootId = row.rootId;
    wrapper.append(createEntryCard(row.entry, { derived: true, rootId: row.rootId }));
    return wrapper;
  }
  const { group, expanded } = row;
  if (expanded && !rootGroupDerivedState(activeDictionary(), group.root.id)) {
    startRootGroupDerivedLoad(activeDictionary(), group.root.id);
  }
  const wrapper = document.createElement("article");
  wrapper.className = "root-entry-group";
  wrapper.dataset.rootId = group.root.id;
  wrapper.append(createEntryCard(group.root, { root: true, rootId: group.root.id }));
  if (group.derivedCount) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = `root-toggle-button${expanded ? " expanded" : ""}`;
    toggle.dataset.appTooltip = "always";
    toggle.setAttribute("aria-label", expanded ? t("collapse") : t("expand"));
    toggle.innerHTML = '<span class="chevron-icon" aria-hidden="true"></span>';
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      rootNavigationContextId = group.root.id;
      if (rootExpansionMode === "all") {
        if (collapsedRootEntries.has(group.root.id)) {
          collapsedRootEntries.delete(group.root.id);
        } else {
          collapsedRootEntries.add(group.root.id);
          rootGroupDerivedStates.delete(rootGroupDerivedStateKey(activeDictionary(), group.root.id));
        }
      } else if (expandedRootEntries.has(group.root.id)) {
        expandedRootEntries.delete(group.root.id);
        rootGroupDerivedStates.delete(rootGroupDerivedStateKey(activeDictionary(), group.root.id));
      } else {
        const derivedKey = rootGroupDerivedStateKey(activeDictionary(), group.root.id);
        if (rootGroupDerivedStates.get(derivedKey)?.status === "error") {
          rootGroupDerivedStates.delete(derivedKey);
        }
        expandedRootEntries.add(group.root.id);
      }
      renderPartFilter();
      renderEntries();
    });
    wrapper.append(toggle);
  }
  return wrapper;
}

function renderEntryQueryTruncationNotice(row) {
  const notice = document.createElement("div");
  notice.className = "entry-list-truncation-notice";
  notice.setAttribute("role", "status");
  notice.textContent = formatText(row.messageKey, {
    loaded: row.loaded,
    total: row.total,
  });
  return notice;
}

function createEntryCard(entry, options = {}) {
  const settings = normalizeDictionarySettings(activeDictionary()?.settings);
  const partText = settings.entryListPartDisplay === "chips" ? "" : entryPartText(entry);
  const { fields: searchFields, fuzzyFields } = entrySearchQueryOptions();
  const lemmaSearchEnabled = searchFields.has("lemma");
  const pronunciationSearchEnabled = searchFields.has("pronunciation");
  const tagSearchEnabled = searchFields.has("tags");
  const definitionSearchEnabled = searchFields.has("definitions");
  const subtitle = [
    entry.pronunciation ? highlightSearchText(entry.pronunciation, fuzzyFields.has("pronunciation"), pronunciationSearchEnabled) : "",
    partText ? highlightSearchText(partText, fuzzyFields.has("tags"), tagSearchEnabled) : "",
  ].filter(Boolean).join(" · ");
  const meaningSummary = entryDefinitionSummary(entry, settings.entryListPolysemyDisplay);
  const searchSnippets = renderEntrySearchSnippets(entry);
  const chipHtml = renderChips(entry, settings.entryListTagDisplayLimit, tagSearchEnabled, fuzzyFields.has("tags"), settings.entryListTagFiltering, {
    includePartTags: settings.entryListPartDisplay !== "subtitle",
  });
  const qualityIssueHtml = renderEntryQualityIssueBadges(options.qualityIssues || []);
  const compactEntryCard = shouldUseCompactEntryCard(entry, { meaningSummary, searchSnippets });
  const footerHtml = [
    chipHtml ? `<div class="chip-row">${chipHtml}</div>` : "",
    qualityIssueHtml,
  ].filter(Boolean).join("");
  const bodyOnlyEntryCard = !compactEntryCard && !footerHtml;
  const button = document.createElement("button");
  button.type = "button";
  button.className = [
    "entry-card",
    entry.id === state.selectedEntryId ? "active" : "",
    options.root ? "root-card" : "",
    options.derived ? "derived-entry-card" : "",
    compactEntryCard ? "compact-entry-card" : "",
    bodyOnlyEntryCard ? "body-only-entry-card" : "",
  ].filter(Boolean).join(" ");
  button.dataset.entryId = entry.id;
  if (entry.id === state.selectedEntryId) {
    button.setAttribute("aria-current", "true");
  }
  if (options.rootId) {
    button.dataset.rootId = options.rootId;
  }
  button.innerHTML = `
    <div class="entry-card-header">
      <strong>${highlightSearchText(entry.lemma, fuzzyFields.has("lemma"), lemmaSearchEnabled)}</strong>
      ${subtitle ? `<small>${subtitle}</small>` : ""}
    </div>
    <div class="entry-card-body">
      ${meaningSummary ? `<p>${highlightSearchText(meaningSummary, fuzzyFields.has("definitions"), definitionSearchEnabled)}</p>` : ""}
      ${searchSnippets}
    </div>
    ${footerHtml ? `<div class="entry-card-footer">${footerHtml}</div>` : ""}
  `;
  button.addEventListener("click", (event) => {
    const tagTarget = event.target.closest("[data-entry-tag-index]");
    if (tagTarget && button.contains(tagTarget)) {
      event.preventDefault();
      event.stopPropagation();
      applyTagFilter(entry, Number(tagTarget.dataset.entryTagIndex), tagTarget.dataset.entryTagValue || "");
      return;
    }
    switchToEntry(entry.id, { rootId: options.rootId || "" });
  });
  button.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    showEntryContextMenu(event, entry, { rootId: options.rootId || "" });
  });
  return button;
}

function renderEntryListSelection() {
  elements.entryList.querySelectorAll(".entry-card[data-entry-id]").forEach((card) => {
    const selected = card.dataset.entryId === state.selectedEntryId;
    card.classList.toggle("active", selected);
    if (selected) {
      card.setAttribute("aria-current", "true");
    } else {
      card.removeAttribute("aria-current");
    }
  });
}

function renderEditorEntrySelection() {
  closeEntryContextMenu();
  renderEntryListSelection();
  renderDetail();
  renderLexicalNetwork();
  scheduleEntryBrowserHeightUpdate();
}

function shouldUseCompactEntryCard(entry, options = {}) {
  const settings = normalizeDictionarySettings(activeDictionary()?.settings);
  const meaningSummary = options.meaningSummary ?? entryDefinitionSummary(entry, settings.entryListPolysemyDisplay);
  const searchSnippets = options.searchSnippets ?? renderEntrySearchSnippets(entry);
  return !meaningSummary && !searchSnippets;
}

const ENTRY_CARD_HEIGHT_ESTIMATES = {
  compactNoFooter: 89,
  compactFirstFooterLine: 33,
  bodyNoFooter: 115,
  bodyFirstFooterLine: 145,
  noSubtitleReduction: 23,
  noSubtitleWithFooterReduction: 7,
  extraFooterLine: 30,
  extraBodyLine: 23,
};

function estimateEntryQualityIssueLines(issues = []) {
  if (!issues.length) {
    return 0;
  }
  const listWidth = Math.max(0, entryVirtualList.container?.clientWidth || elements.entryList?.clientWidth || 340);
  const basePerLine = listWidth < 300 ? 2 : listWidth < 420 ? 3 : 4;
  const longestTitle = Math.max(
    ...issues.map((issue) => String(issue.title || aText("质量问题", "Quality issue")).length),
  );
  const perLine = longestTitle > 18 ? Math.max(1, basePerLine - 1) : basePerLine;
  return Math.max(1, Math.ceil(issues.length / perLine));
}

function estimateSearchSnippetCount(searchSnippets = "") {
  return (String(searchSnippets).match(/class="search-snippet"/g) || []).length;
}

function estimateEntryCardHeight(entry, options = {}) {
  const settings = normalizeDictionarySettings(activeDictionary()?.settings);
  const meaningSummary = options.meaningSummary ?? entryDefinitionSummary(entry, settings.entryListPolysemyDisplay);
  const searchSnippets = options.searchSnippets ?? renderEntrySearchSnippets(entry);
  const hasBody = Boolean(meaningSummary || searchSnippets);
  const hasSubtitle = Boolean(entry.pronunciation || (settings.entryListPartDisplay !== "chips" && entryPartText(entry)));
  const hasTagFooter = Boolean(
    entryListTagItems(entry, { includePartTags: settings.entryListPartDisplay !== "subtitle" }).length
      && settings.entryListTagDisplayLimit > 0,
  );
  const qualityIssueLines = estimateEntryQualityIssueLines(options.qualityIssues || []);
  const footerLines = (hasTagFooter ? 1 : 0) + qualityIssueLines;
  const searchSnippetCount = estimateSearchSnippetCount(searchSnippets);
  const bodyLines = (meaningSummary ? 1 : 0) + searchSnippetCount;
  const extraBodyLines = hasBody ? Math.max(0, bodyLines - 1) : 0;
  const bodyHeight = extraBodyLines * ENTRY_CARD_HEIGHT_ESTIMATES.extraBodyLine;
  if (!hasBody) {
    const estimated = ENTRY_CARD_HEIGHT_ESTIMATES.compactNoFooter
      + (footerLines
        ? ENTRY_CARD_HEIGHT_ESTIMATES.compactFirstFooterLine
          + Math.max(0, footerLines - 1) * ENTRY_CARD_HEIGHT_ESTIMATES.extraFooterLine
        : 0);
    return Math.max(66, estimated - (hasSubtitle ? 0 : ENTRY_CARD_HEIGHT_ESTIMATES.noSubtitleReduction));
  }
  const estimated = (footerLines
    ? ENTRY_CARD_HEIGHT_ESTIMATES.bodyFirstFooterLine
      + Math.max(0, footerLines - 1) * ENTRY_CARD_HEIGHT_ESTIMATES.extraFooterLine
    : ENTRY_CARD_HEIGHT_ESTIMATES.bodyNoFooter)
    + bodyHeight;
  const subtitleReduction = hasSubtitle
    ? 0
    : (footerLines
      ? ENTRY_CARD_HEIGHT_ESTIMATES.noSubtitleWithFooterReduction
      : ENTRY_CARD_HEIGHT_ESTIMATES.noSubtitleReduction);
  return Math.max(footerLines ? 138 : 92, estimated - subtitleReduction);
}

function closeEntryContextMenu() {
  if (!activeEntryContextMenu) {
    return;
  }
  activeEntryContextMenu.cleanup?.forEach((cleanup) => cleanup());
  activeEntryContextMenu.element.remove();
  activeEntryContextMenu = null;
}

function positionEntryContextMenu(menu, x, y) {
  const gap = 8;
  const rect = menu.getBoundingClientRect();
  const left = Math.max(gap, Math.min(window.innerWidth - rect.width - gap, x));
  const top = Math.max(gap, Math.min(window.innerHeight - rect.height - gap, y));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function showEntryContextMenu(event, entry, options = {}) {
  closeEntryContextMenu();
  const menu = document.createElement("div");
  menu.className = "entry-context-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", t("entryContextMenu"));
  const actions = [
    {
      key: "edit",
      label: t("editEntry"),
      handler: () => editEntryFromContextMenu(entry.id, options),
    },
    {
      key: "derived",
      label: t("createDerivedEntry"),
      handler: () => beginDerivedEntry(entry),
    },
    {
      key: "delete",
      label: t("delete"),
      danger: true,
      handler: () => deleteEntryById(entry.id),
    },
  ];
  actions.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.entryContextAction = action.key;
    button.className = action.danger ? "danger" : "";
    button.setAttribute("role", "menuitem");
    button.textContent = action.label;
    button.addEventListener("click", async () => {
      closeEntryContextMenu();
      await action.handler();
    });
    menu.append(button);
  });
  document.body.append(menu);
  positionEntryContextMenu(menu, event.clientX, event.clientY);

  const closeOnPointerDown = (pointerEvent) => {
    if (!menu.contains(pointerEvent.target)) {
      closeEntryContextMenu();
    }
  };
  const closeOnKeydown = (keyEvent) => {
    if (keyEvent.key === "Escape") {
      closeEntryContextMenu();
    }
  };
  const closeOnScroll = () => closeEntryContextMenu();
  document.addEventListener("pointerdown", closeOnPointerDown, true);
  document.addEventListener("keydown", closeOnKeydown);
  window.addEventListener("scroll", closeOnScroll, { passive: true });
  elements.entryList.addEventListener("scroll", closeOnScroll, { passive: true });
  activeEntryContextMenu = {
    element: menu,
    cleanup: [
      () => document.removeEventListener("pointerdown", closeOnPointerDown, true),
      () => document.removeEventListener("keydown", closeOnKeydown),
      () => window.removeEventListener("scroll", closeOnScroll),
      () => elements.entryList.removeEventListener("scroll", closeOnScroll),
    ],
  };
  menu.querySelector("button")?.focus();
}

async function editEntryFromContextMenu(entryId, options = {}) {
  await switchToEntry(entryId, options);
  if (state.selectedEntryId === entryId) {
    await beginEditEntry();
  }
}

function renderEntryQualityIssueBadges(issues = []) {
  if (!issues.length) {
    return "";
  }
  return `<div class="entry-quality-issues" aria-label="${escapeHtml(aText("质量问题", "Quality issues"))}">
    ${issues.map((issue) => {
    const severity = issue.severity || "low";
    const title = issue.title || aText("质量问题", "Quality issue");
    const detail = issue.detail || title;
    const moduleLabel = qualityIssueModuleLabel(issue.module || "other");
    return `
      <span class="entry-quality-issue ${escapeHtml(severity)}">
        <span class="entry-quality-issue-label">${escapeHtml(title)}</span>
        <span class="entry-quality-issue-tooltip" role="tooltip">
          <strong>${escapeHtml(title)}</strong>
          <small>${escapeHtml(qualityIssueSeverityLabel(severity))} · ${escapeHtml(moduleLabel)}</small>
          <span>${escapeHtml(detail)}</span>
        </span>
      </span>
    `;
  }).join("")}
  </div>`;
}

function updateEntryQualityIssueTooltipPlacement(issueElement) {
  const tooltip = issueElement?.querySelector(".entry-quality-issue-tooltip");
  const scrollContainer = issueElement?.closest(".entry-list") || elements.entryList;
  if (!tooltip || !scrollContainer) {
    return;
  }
  issueElement.classList.remove("show-tooltip-above");
  const issueRect = issueElement.getBoundingClientRect();
  const containerRect = scrollContainer.getBoundingClientRect();
  const gap = 8;
  const visibleTop = Math.max(containerRect.top, gap);
  const visibleBottom = Math.min(containerRect.bottom, window.innerHeight - gap);
  const tooltipWidth = Math.min(
    280,
    Math.max(120, containerRect.width - 16),
    Math.max(120, window.innerWidth - gap * 2),
  );
  tooltip.style.setProperty("--entry-quality-tooltip-width", `${tooltipWidth}px`);
  tooltip.style.setProperty("--entry-quality-tooltip-left", `${Math.max(gap, Math.min(window.innerWidth - tooltipWidth - gap, issueRect.left))}px`);
  tooltip.style.setProperty("--entry-quality-tooltip-top", `${issueRect.bottom + gap}px`);
  const tooltipRect = tooltip.getBoundingClientRect();
  const belowSpace = visibleBottom - issueRect.bottom - gap;
  const aboveSpace = issueRect.top - visibleTop - gap;
  const shouldShowAbove = tooltipRect.height > belowSpace && aboveSpace > belowSpace;
  const preferredTop = shouldShowAbove
    ? issueRect.top - tooltipRect.height - gap
    : issueRect.bottom + gap;
  const maxTop = Math.max(gap, window.innerHeight - tooltipRect.height - gap);
  const top = Math.max(gap, Math.min(maxTop, preferredTop));
  tooltip.style.setProperty("--entry-quality-tooltip-top", `${top}px`);
  issueElement.classList.toggle("show-tooltip-above", shouldShowAbove);
}

function updateHoveredEntryQualityIssueTooltipPlacement() {
  const issue = elements.entryList.querySelector(".entry-quality-issue:hover");
  if (issue) {
    updateEntryQualityIssueTooltipPlacement(issue);
  }
}

function entryDefinitionMeanings(entry) {
  return entryDefinitionItems(entry)
    .map((definition) => String(definition.meaning || "").trim())
    .filter(Boolean);
}

function entryDefinitionItems(entry = {}) {
  if (Array.isArray(entry.definitions)) {
    return entry.definitions;
  }
  return Array.isArray(entry.definitionPreviews) ? entry.definitionPreviews : [];
}

function entryDefinitionSummary(entry, showPolysemy = false) {
  const meanings = entryDefinitionMeanings(entry);
  if (!meanings.length) {
    return "";
  }
  if (!showPolysemy || meanings.length === 1) {
    return meanings[0];
  }
  return meanings.map((meaning, index) => `${index + 1}. ${meaning}`).join("  ");
}

async function switchToEntry(entryId, options = {}) {
  if (!entryId) {
    return;
  }

  const dictionary = activeDictionary();
  if (!dictionary) {
    return;
  }

  const ready = await closePendingEditsForPageSwitch();
  if (!ready) {
    return;
  }

  entryDraft = null;
  state.selectedEntryId = entryId;
  editorMode = "display";
  const navigationOptions = prepareRootModeEntryNavigation(entryId, options);
  const detailLoadPromise = ensureSelectedEntryDetailLoaded();
  renderEditorEntrySelection();
  await detailLoadPromise;
  if (state.selectedEntryId !== entryId) {
    return;
  }
  scheduleEntryCardScroll(entryId, navigationOptions);
  closeMobileEntryBrowserDrawer();
}

function prepareRootModeEntryNavigation(entryId, options = {}) {
  if (!rootMode || advancedFilter) {
    return options;
  }

  let rootId = String(options.rootId || "");
  if (!rootId) {
    const loadedRoot = rootGroupsQueryState.pages
      .filter((page) => page.status === "success")
      .flatMap((page) => page.items)
      .find((group) => group.root.id === entryId);
    rootId = loadedRoot?.root?.id || "";
  }
  if (!rootId) {
    for (const [key, derivedState] of rootGroupDerivedStates) {
      if (derivedState.status === "success" && derivedState.items.some((entry) => entry.id === entryId)) {
        rootId = key.slice(key.lastIndexOf("\u0000") + 1);
        break;
      }
    }
  }
  if (!rootId) {
    return options;
  }

  const isDerivedEntry = rootId !== entryId;
  rootNavigationContextId = rootId;
  if (isDerivedEntry) {
    if (rootExpansionMode === "all") {
      collapsedRootEntries.delete(rootId);
    } else {
      expandedRootEntries.add(rootId);
    }
  }
  return { ...options, rootId };
}

function scheduleEntryCardScroll(entryId, options = {}) {
  if (!entryId) {
    return;
  }
  pendingEntryCardScroll = {
    entryId,
    options: { ...options },
    locationRequestKey: "",
  };
  flushPendingEntryCardScroll();
}

function markPendingEntryLocationRequest(entryId, requestKey) {
  if (!pendingEntryCardScroll || pendingEntryCardScroll.entryId !== entryId) {
    return false;
  }
  if (pendingEntryCardScroll.locationRequestKey === requestKey) {
    return false;
  }
  pendingEntryCardScroll.locationRequestKey = requestKey;
  return true;
}

function clearPendingEntryLocationRequest(entryId, requestKey) {
  if (
    pendingEntryCardScroll?.entryId === entryId
    && pendingEntryCardScroll.locationRequestKey === requestKey
  ) {
    pendingEntryCardScroll.locationRequestKey = "";
  }
}

function startEntryQueryLocation(dictionary, entryId) {
  const key = entryQueryState.key;
  const requestId = entryQueryState.requestId;
  const requestKey = `entry-location\u0000${key}\u0000${entryId}`;
  if (!markPendingEntryLocationRequest(entryId, requestKey)) {
    return;
  }
  queryPageCache.load({
    key: queryPageCacheKey("entry-location", `${key}\u0000${entryId}`),
    dictionaryId: dictionary.id,
    load: () => api(entryQueryLocationUrl(dictionary, entryId)),
    transform: (result) => ({
      ...compactEntryQueryResult(result),
      location: result?.location || null,
    }),
  })
    .then((result) => {
      if (
        entryQueryState.requestId !== requestId
        || entryQueryState.key !== key
        || entryQueryApiKey(activeDictionary()) !== key
        || pendingEntryCardScroll?.entryId !== entryId
      ) {
        return;
      }
      if (!result.location?.found) {
        pendingEntryCardScroll = null;
        return;
      }
      const page = entryQueryState.pages.find((candidate) => candidate.index === result.location.windowIndex);
      if (!page) {
        return;
      }
      page.estimatedHeight = queryWindowPageHeight(entryVirtualList, page.index, page.estimatedHeight);
      page.offset = result.location.windowOffset;
      page.cursor = result.pageInfo?.windowCursor || entryQueryState.windowCursor;
      page.status = "success";
      page.items = result.items;
      page.pageInfo = result.pageInfo;
      page.error = null;
      page.lastAccessAt = performance.now();
      entryQueryState.windowCursor = result.pageInfo?.windowCursor || entryQueryState.windowCursor;
      preserveQueryWindowPageHeight(
        page,
        result.items.reduce((total, entry) => (
          total + estimateEntryCardHeight(entry, { qualityIssues: advancedFilterIssuesForEntry(entry.id) })
        ), 0),
        Boolean(entryQueryState.windowCursor),
      );
      syncEntryQueryWindowState();
      evictDistantQueryWindowPages(
        entryQueryState.pages,
        entryVirtualList,
        new Set([page.index]),
        entryId,
      );
      syncEntryQueryWindowState();
      renderEntries();
      flushPendingEntryCardScroll();
    })
    .catch((error) => {
      if (error?.code === "query_cursor_stale") {
        invalidateQueryPageCacheAfterCursorStale(dictionary);
        restartEntryQueryWindowAfterStale(dictionary);
        return;
      }
      console.error(error);
      if (pendingEntryCardScroll?.entryId === entryId) {
        pendingEntryCardScroll = null;
      }
    })
    .finally(() => clearPendingEntryLocationRequest(entryId, requestKey));
}

function startRootGroupQueryLocation(dictionary, entryId, options = {}) {
  const key = rootGroupsQueryState.key;
  const requestId = rootGroupsQueryState.requestId;
  const preferredRootId = String(options.rootId || "");
  const requestKey = `root-location\u0000${key}\u0000${entryId}\u0000${preferredRootId}`;
  if (!markPendingEntryLocationRequest(entryId, requestKey)) {
    return;
  }
  queryPageCache.load({
    key: queryPageCacheKey("root-group-location", `${key}\u0000${entryId}\u0000${preferredRootId}`),
    dictionaryId: dictionary.id,
    load: () => api(rootGroupsLocationUrl(dictionary, entryId, { preferredRootId })),
    transform: (result) => ({
      ...compactRootGroupsQueryResult(result),
      location: result?.location || null,
    }),
  })
    .then((result) => {
      if (
        rootGroupsQueryState.requestId !== requestId
        || rootGroupsQueryState.key !== key
        || rootGroupsQueryApiKey(activeDictionary()) !== key
        || pendingEntryCardScroll?.entryId !== entryId
      ) {
        return;
      }
      if (!result.location?.found) {
        pendingEntryCardScroll = null;
        return;
      }
      const rootId = result.location.rootId;
      const page = rootGroupsQueryState.pages.find((candidate) => candidate.index === result.location.windowIndex);
      if (!page || !rootId) {
        return;
      }
      rootNavigationContextId = rootId;
      if (rootId !== entryId) {
        if (rootExpansionMode === "all") {
          collapsedRootEntries.delete(rootId);
        } else {
          expandedRootEntries.add(rootId);
        }
      }
      pendingEntryCardScroll.options = {
        ...pendingEntryCardScroll.options,
        rootId,
      };
      page.estimatedHeight = queryWindowPageHeight(entryVirtualList, page.index, page.estimatedHeight);
      page.offset = result.location.windowOffset;
      page.cursor = result.pageInfo?.windowCursor || rootGroupsQueryState.windowCursor;
      page.status = "success";
      page.items = result.groups;
      page.pageInfo = result.pageInfo;
      page.error = null;
      page.lastAccessAt = performance.now();
      rootGroupsQueryState.windowCursor = result.pageInfo?.windowCursor || rootGroupsQueryState.windowCursor;
      applyRootGroupWindowMetrics(rootGroupsQueryState, result.pageInfo);
      preserveQueryWindowPageHeight(
        page,
        result.groups.reduce((total, group) => total + rootGroupEstimatedHeight(group), 0),
        Boolean(rootGroupsQueryState.windowCursor),
      );
      syncRootGroupsQueryWindowState();
      evictDistantQueryWindowPages(
        rootGroupsQueryState.pages,
        entryVirtualList,
        new Set([page.index]),
        new Set([rootId, entryId]),
        {
          onEvict: (evictedPage) => {
            evictedPage.items.forEach((group) => {
              rootGroupDerivedStates.delete(rootGroupDerivedStateKey(dictionary, group.root.id));
            });
          },
        },
      );
      syncRootGroupsQueryWindowState();
      renderEntries();
      if (rootId !== entryId && !rootGroupDerivedState(dictionary, rootId)) {
        startRootGroupDerivedLoad(dictionary, rootId);
      }
      flushPendingEntryCardScroll();
    })
    .catch((error) => {
      if (error?.code === "query_cursor_stale") {
        invalidateQueryPageCacheAfterCursorStale(dictionary);
        restartRootGroupsWindowAfterStale();
        return;
      }
      console.error(error);
      if (pendingEntryCardScroll?.entryId === entryId) {
        pendingEntryCardScroll = null;
      }
    })
    .finally(() => clearPendingEntryLocationRequest(entryId, requestKey));
}

function ensureQueryWindowForEntryScroll(entryId, options = {}) {
  const dictionary = activeDictionary();
  if (!dictionary || advancedFilter) {
    return;
  }
  if (!rootMode && entryQueryState.status === "success") {
    if (entryQueryState.pages.some((page) => page.items.some((entry) => entry.id === entryId))) {
      return;
    }
    startEntryQueryLocation(dictionary, entryId);
    return;
  }
  if (!rootMode || rootGroupsQueryState.status !== "success") {
    return;
  }
  let rootId = String(options.rootId || "");
  const loadedGroups = rootGroupsQueryState.pages
    .filter((page) => page.status === "success")
    .flatMap((page) => page.items);
  if (!rootId && loadedGroups.some((group) => group.root.id === entryId)) {
    rootId = entryId;
  }
  if (!rootId) {
    for (const group of loadedGroups) {
      const derivedState = rootGroupDerivedState(dictionary, group.root.id);
      if (derivedState?.status === "success" && derivedState.items.some((entry) => entry.id === entryId)) {
        rootId = group.root.id;
        break;
      }
    }
  }
  const loadedGroup = rootId ? loadedGroups.find((group) => group.root.id === rootId) : null;
  if (!loadedGroup) {
    startRootGroupQueryLocation(dictionary, entryId, options);
    return;
  }
  rootNavigationContextId = rootId;
  if (rootId !== entryId) {
    if (rootExpansionMode === "all") {
      collapsedRootEntries.delete(rootId);
    } else {
      expandedRootEntries.add(rootId);
    }
    if (!rootGroupDerivedState(dictionary, rootId)) {
      startRootGroupDerivedLoad(dictionary, rootId);
    }
  }
}

async function closePendingEditsForPageSwitch() {
  const dictionary = activeDictionary();
  if (!dictionary) {
    return true;
  }

  const settings = normalizeDictionarySettings(dictionary.settings);
  const inlineForm = partialEditForm();
  try {
    if (inlineForm) {
      if (partialEntryFormIsDirty()) {
        const action = settings.partialEditPageSwitchAction === "prompt"
          ? await appEditSwitchPrompt(t("partialEditSwitchPrompt"))
          : settings.partialEditPageSwitchAction;
        if (action === "cancel" || action === false) {
          return false;
        }
        if (action === "save") {
          const saved = await savePartialEdit({ preventDefault() {} });
          if (!saved) {
            return false;
          }
        } else if (action === "discard") {
          cancelPartialEdit();
        }
      } else {
        cancelPartialEdit();
      }
    }

    if (state.activeView === "editor" && editorMode === "edit" && !elements.entryForm.hidden) {
      if (fullEntryFormIsDirty()) {
        const action = settings.fullEditPageSwitchAction === "prompt"
          ? await appEditSwitchPrompt(t("fullEditSwitchPrompt"))
          : settings.fullEditPageSwitchAction;
        if (action === "cancel" || action === false) {
          return false;
        }
        if (action === "save") {
          const saved = await saveEntry({ preventDefault() {} });
          if (!saved) {
            return false;
          }
        } else if (action === "discard") {
          entryDraft = null;
          editorMode = "display";
        }
      } else {
        entryDraft = null;
        editorMode = "display";
      }
    }
  } catch (error) {
    return false;
  }

  return true;
}

function filteredEntries() {
  const dictionary = activeDictionary();

  if (!dictionary) {
    return [];
  }

  if (advancedFilter) {
    const ids = new Set(advancedFilter.entryIds || []);
    return [...dictionary.entries].filter((entry) => ids.has(entry.id)).sort(compareEntries);
  }

  const query = searchQuery;
  const { fields, fuzzyFields } = entrySearchQueryOptions(dictionary);

  return [...dictionary.entries]
    .filter((entry) => entryMatchesSearch(entry, dictionary, { query, fields, fuzzyFields, respectPart: true }))
    .sort(compareEntries);
}

function entryViewSnapshot() {
  return {
    rootMode,
    activePart,
    entrySort,
    searchQuery,
    rootExpansionMode,
    expandedRootEntries: [...expandedRootEntries],
    collapsedRootEntries: [...collapsedRootEntries],
  };
}

function restoreEntryViewSnapshot(snapshot = {}) {
  rootMode = Boolean(snapshot.rootMode);
  activePart = snapshot.activePart || "";
  entrySort = snapshot.entrySort || "lemmaAsc";
  searchQuery = snapshot.searchQuery || "";
  rootExpansionMode = snapshot.rootExpansionMode === "all" ? "all" : "manual";
  expandedRootEntries.clear();
  (snapshot.expandedRootEntries || []).forEach((id) => expandedRootEntries.add(id));
  collapsedRootEntries.clear();
  (snapshot.collapsedRootEntries || []).forEach((id) => collapsedRootEntries.add(id));
  refreshRootGroupWindowHeightEstimates();
  elements.searchInput.value = searchQuery;
  elements.sortSelect.value = entrySort;
}

async function enterAdvancedFilter(action) {
  const dictionary = activeDictionary();
  if (!dictionary || (!action?.entryIds?.length && !action?.variants?.length)) {
    return;
  }

  const ready = await closePendingEditsForPageSwitch();
  if (!ready) {
    return;
  }

  const previous = advancedFilter?.previous || entryViewSnapshot();
  const variants = normalizeAdvancedFilterVariants(action);
  const activeVariant = variants[0] || {
    title: action.title || t("advancedFilterMode"),
    entryIds: entryIdsFrom(action.entryIds),
  };
  advancedFilter = {
    title: activeVariant.title,
    entryIds: activeVariant.entryIds,
    issueMap: activeVariant.issueMap,
    meta: activeVariant.key && action.meta ? { ...action.meta, activeKey: activeVariant.key } : action.meta,
    previous,
    variants,
    variantIndex: 0,
  };
  rootMode = false;
  activePart = "";
  searchQuery = "";
  state.activeView = "editor";
  revealEntryBrowserForResults();
  const ids = new Set(advancedFilter.entryIds);
  const filteredEntries = [...dictionary.entries].filter((entry) => ids.has(entry.id)).sort(compareEntries);
  const preferredEntry = action.preferredEntryId
    ? filteredEntries.find((entry) => entry.id === action.preferredEntryId)
    : null;
  const firstEntry = preferredEntry || filteredEntries[0];
  if (firstEntry) {
    state.selectedEntryId = firstEntry.id;
    editorMode = "display";
    entryDraft = null;
  }
  render();
  scheduleEntryCardScroll(state.selectedEntryId);
}

async function applyTagFilter(entry, tagIndex, tag) {
  const dictionary = activeDictionary();
  if (!dictionary || !tag) {
    return;
  }

  const ready = await closePendingEditsForPageSwitch();
  if (!ready) {
    return;
  }

  if (entryTagIsPart(entry, tagIndex, tag, dictionary)) {
    advancedFilter = null;
    rootMode = false;
    activePart = tag;
    revealEntryBrowserForResults();
    renderPartFilter();
    renderEntries();
    renderShellEntryBrowser();
    renderMobileAppBar();
    scheduleEntryCardScroll(entry.id);
    return;
  }

  await enterAdvancedFilter({
    ...tagAdvancedFilterAction(tag),
    preferredEntryId: entry.id,
  });
}

function exitAdvancedFilter() {
  if (!advancedFilter) {
    return;
  }
  const previous = advancedFilter.previous;
  advancedFilter = null;
  restoreEntryViewSnapshot(previous);
  render();
}

function normalizeAdvancedFilterVariants(action, options = {}) {
  const variants = action?.variants?.length
    ? action.variants
    : [{ title: action?.title || t("advancedFilterMode"), entryIds: action?.entryIds || [] }];
  return variants
    .map((variant) => {
      const entryIds = entryIdsFrom(variant.entryIds);
      return {
        key: variant.key || "",
        title: variant.title || t("advancedFilterMode"),
        entryIds,
        issueMap: advancedFilterIssueMapFromIssues(variant.issues, entryIds),
      };
    })
    .filter((variant, index) => variant.entryIds.length || (options.keepFirstEmpty && index === 0));
}

function advancedFilterIssueMapFromIssues(issues = [], entryIds = []) {
  if (!issues.length) {
    return {};
  }
  const allowedIds = new Set(entryIds);
  return issues.reduce((map, issue) => {
    if (!issue?.entryId || !allowedIds.has(issue.entryId)) {
      return map;
    }
    if (!map[issue.entryId]) {
      map[issue.entryId] = [];
    }
    map[issue.entryId].push({
      severity: issue.severity || "low",
      title: issue.title || aText("质量问题", "Quality issue"),
      detail: issue.detail || "",
      module: issue.module || "other",
    });
    return map;
  }, {});
}

function advancedFilterIssuesForEntry(entryId) {
  return advancedFilter?.issueMap?.[entryId] || [];
}

function advancedFilterDisplayTitle() {
  if (!advancedFilter) {
    return "";
  }
  const dictionary = activeDictionary();
  if (advancedFilter.meta?.type === "tag" && advancedFilter.meta.tag) {
    return analysisFilterTitle(t("tags"), displayTag(advancedFilter.meta.tag, dictionary));
  }
  if (advancedFilter.meta?.type === "quality" && dictionary) {
    const action = qualityIssueFilterAction(
      getQualityViewReport(dictionary),
      advancedFilter.meta.group,
      advancedFilter.meta.activeKey,
      { allowEmptyActive: true },
    );
    return action?.title || advancedFilter.title;
  }
  return localizeAdvancedFilterTitle(advancedFilter.title || t("advancedFilterMode"));
}

function localizeAdvancedFilterTitle(title) {
  const text = String(title || "");
  const pairMatch = text.match(/^(.+?)\s*[:：]\s*(.+)$/);
  if (pairMatch) {
    const label = localizeAdvancedFilterSegment(pairMatch[1]);
    const value = localizeAdvancedFilterValue(pairMatch[1], pairMatch[2]);
    return analysisFilterTitle(label, value);
  }
  const exactTitles = new Map([
    ["Quality issues", aText("质量问题", "Quality issues")],
    ["质量问题", aText("质量问题", "Quality issues")],
    ["High-priority quality issues", aText("高优先级质量问题", "High-priority quality issues")],
    ["高优先级质量问题", aText("高优先级质量问题", "High-priority quality issues")],
    ["Medium-priority quality issues", aText("中优先级质量问题", "Medium-priority quality issues")],
    ["中优先级质量问题", aText("中优先级质量问题", "Medium-priority quality issues")],
    ["Low-priority quality issues", aText("低优先级质量问题", "Low-priority quality issues")],
    ["低优先级质量问题", aText("低优先级质量问题", "Low-priority quality issues")],
    ["Derived entries", aText("衍生词", "Derived entries")],
    ["衍生词", aText("衍生词", "Derived entries")],
    ["Has definitions", aText("有释义", "Has definitions")],
    ["有释义", aText("有释义", "Has definitions")],
    ["No definitions", aText("无释义", "No definitions")],
    ["无释义", aText("无释义", "No definitions")],
    ["Has IPA", aText("有 IPA", "Has IPA")],
    ["有 IPA", aText("有 IPA", "Has IPA")],
    ["No IPA", aText("无 IPA", "No IPA")],
    ["无 IPA", aText("无 IPA", "No IPA")],
    ["Has morphology table", aText("有形态表格", "Has morphology table")],
    ["有形态表格", aText("有形态表格", "Has morphology table")],
    ["No morphology table", aText("无形态表格", "No morphology table")],
    ["无形态表格", aText("无形态表格", "No morphology table")],
    ["Empty morphology cells", aText("形态空单元", "Empty morphology cells")],
    ["形态空单元", aText("形态空单元", "Empty morphology cells")],
    ["Glossed examples", aText("Glossed 例句", "Glossed examples")],
    ["Glossed 例句", aText("Glossed 例句", "Glossed examples")],
    ["Multi-source entries", aText("多来源词条", "Multi-source entries")],
    ["多来源词条", aText("多来源词条", "Multi-source entries")],
    ["Has examples", aText("有例句", "Has examples")],
    ["有例句", aText("有例句", "Has examples")],
    ["No examples", aText("无例句", "No examples")],
    ["无例句", aText("无例句", "No examples")],
    ["Has notes", aText("有备注", "Has notes")],
    ["有备注", aText("有备注", "Has notes")],
    ["No notes", aText("无备注", "No notes")],
    ["无备注", aText("无备注", "No notes")],
    ["Has sources", aText("有来源", "Has sources")],
    ["有来源", aText("有来源", "Has sources")],
    ["No sources", aText("无来源", "No sources")],
    ["无来源", aText("无来源", "No sources")],
    ["Auto IPA matches", aText("IPA 自动生成一致", "Auto IPA matches")],
    ["IPA 自动生成一致", aText("IPA 自动生成一致", "Auto IPA matches")],
    ["Auto IPA mismatches (loose)", aText("IPA 自动生成不一致（宽松）", "Auto IPA mismatches (loose)")],
    ["IPA 自动生成不一致（宽松）", aText("IPA 自动生成不一致（宽松）", "Auto IPA mismatches (loose)")],
    ["Auto IPA mismatches (strict)", aText("IPA 自动生成不一致（严格）", "Auto IPA mismatches (strict)")],
    ["IPA 自动生成不一致（严格）", aText("IPA 自动生成不一致（严格）", "Auto IPA mismatches (strict)")],
    ["Word Forms", aText("词形问题", "Word Forms")],
    ["词形问题", aText("词形问题", "Word Forms")],
    ["Etymology", aText("词源网络", "Etymology")],
    ["词源网络", aText("词源网络", "Etymology")],
    ["Glossed Examples", aText("Glossed 例句", "Glossed Examples")],
    ["Other", aText("其他问题", "Other")],
    ["其他问题", aText("其他问题", "Other")],
  ]);
  return exactTitles.get(text) || localizeAdvancedFilterSegment(text);
}

function localizeAdvancedFilterSegment(segment) {
  const text = String(segment || "").trim();
  const labelPairs = [
    ["词性", "Part of Speech"],
    ["标签", "Tag", ["Tags"]],
    ["标签组合", "Tag Combination", ["Tag Combinations"]],
    ["首字母", "Initial Letter", ["Initial Letters"]],
    ["词长", "Word Length", ["Word Lengths"]],
    ["正写法字符", "Orthographic Character", ["Orthographic Characters"]],
    ["正写法双字符组合", "Orthographic Bigram", ["Orthographic Bigrams"]],
    ["词形", "Lemma"],
    ["释义", "Definitions", ["Definition"]],
    ["例句", "Examples", ["Example"]],
    ["词源", "Etymology"],
    ["形态形式", "Morphology forms", ["Morphology Forms"]],
    ["IPA 音位", "IPA Unit", ["IPA Units"]],
    ["IPA 首音", "IPA Initial", ["IPA Initials"]],
    ["IPA 尾音", "IPA Final", ["IPA Finals"]],
    ["音节数", "Syllable Count", ["Syllable Counts"]],
    ["形态表格", "Morphology Table", ["Morphology Tables", "Morphology table"]],
    ["搜索字段", "Search Field", ["Current Search Fields"]],
    ["新增日期", "Created Date"],
    ["编辑日期", "Updated Date"],
  ];
  const normalizedText = normalize(text);
  const match = labelPairs.find(([zh, en, aliases = []]) =>
    [zh, en, ...aliases].some((candidate) => normalize(candidate) === normalizedText)
  );
  return match ? aText(match[0], match[1]) : text;
}

function localizeAdvancedFilterValue(label, value) {
  const normalizedLabel = normalize(String(label || ""));
  const searchFieldLabels = ["搜索字段", "Search Field", "Current Search Fields"].map(normalize);
  if (searchFieldLabels.includes(normalizedLabel)) {
    return localizeAdvancedFilterSegment(value);
  }
  return String(value || "").trim();
}

function tagAdvancedFilterAction(tag, options = {}) {
  const dictionary = activeDictionary();
  if (!dictionary || !tag) {
    return null;
  }
  const normalizedTag = normalize(tag);
  const entryIds = dictionary.entries
    .filter((candidate) => (candidate.tags || []).some((item) => normalize(item) === normalizedTag))
    .map((candidate) => candidate.id);
  return advancedFilterAction(analysisFilterTitle(t("tags"), displayTag(tag, dictionary)), entryIds, {
    allowEmptyActive: Boolean(options.allowEmptyActive),
    key: "tag",
    meta: { type: "tag", tag },
  });
}

function partFilterAction(part) {
  return { type: "part-filter", part: part || NO_PART_FILTER_VALUE };
}

function rebuildAdvancedFilterAction(options = {}) {
  const dictionary = activeDictionary();
  if (!dictionary || !advancedFilter) {
    return null;
  }
  const allowEmptyActive = Boolean(options.allowEmptyActive);
  if (advancedFilter.meta?.type === "quality") {
    return qualityIssueFilterAction(
      getQualityViewReport(dictionary),
      advancedFilter.meta.group,
      advancedFilter.meta.activeKey,
      { allowEmptyActive },
    );
  }
  if (advancedFilter.meta?.type === "tag") {
    return tagAdvancedFilterAction(advancedFilter.meta.tag, { allowEmptyActive });
  }
  return null;
}

function applyAdvancedFilterAction(action, options = {}) {
  if (!advancedFilter || !action) {
    return false;
  }
  const variants = normalizeAdvancedFilterVariants(action, { keepFirstEmpty: Boolean(options.keepFirstEmpty) });
  const activeVariant = variants[0];
  if (!activeVariant) {
    return false;
  }
  advancedFilter = {
    ...advancedFilter,
    title: activeVariant.title,
    entryIds: activeVariant.entryIds,
    issueMap: activeVariant.issueMap,
    meta: activeVariant.key && action.meta ? { ...action.meta, activeKey: activeVariant.key } : action.meta,
    variants,
    variantIndex: 0,
  };
  const dictionary = activeDictionary();
  const ids = new Set(advancedFilter.entryIds || []);
  if (dictionary && ids.size && !ids.has(state.selectedEntryId)) {
    state.selectedEntryId = [...dictionary.entries].filter((entry) => ids.has(entry.id)).sort(compareEntries)[0]?.id || state.selectedEntryId;
    editorMode = "display";
    entryDraft = null;
  }
  return true;
}

function refreshAdvancedFilterState() {
  if (!advancedFilter) {
    return false;
  }
  const action = rebuildAdvancedFilterAction({ allowEmptyActive: true });
  if (action) {
    return applyAdvancedFilterAction(action, { keepFirstEmpty: true });
  }
  const dictionary = activeDictionary();
  if (!dictionary) {
    return false;
  }
  const existingIds = new Set(dictionary.entries.map((entry) => entry.id));
  advancedFilter = {
    ...advancedFilter,
    entryIds: (advancedFilter.entryIds || []).filter((id) => existingIds.has(id)),
    variants: (advancedFilter.variants || [])
      .map((variant) => ({
        ...variant,
        entryIds: (variant.entryIds || []).filter((id) => existingIds.has(id)),
      }))
      .filter((variant, index) => variant.entryIds.length || index === advancedFilter.variantIndex),
  };
  return true;
}

function refreshAdvancedFilter() {
  if (!refreshAdvancedFilterState()) {
    return;
  }
  revealEntryBrowserForResults();
  render();
  if (advancedFilter?.entryIds?.length && advancedFilter.entryIds.includes(state.selectedEntryId)) {
    scheduleEntryCardScroll(state.selectedEntryId);
  }
}

function nextAdvancedFilterVariantIndex() {
  const variants = advancedFilter?.variants || [];
  if (variants.length < 2) {
    return -1;
  }
  const currentIndex = Math.max(0, advancedFilter.variantIndex || 0);
  for (let step = 1; step < variants.length; step += 1) {
    const index = (currentIndex + step) % variants.length;
    if (variants[index]?.entryIds?.length) {
      return index;
    }
  }
  return -1;
}

function canCycleAdvancedFilter() {
  return nextAdvancedFilterVariantIndex() >= 0;
}

function cycleAdvancedFilterVariant() {
  const nextIndex = nextAdvancedFilterVariantIndex();
  if (nextIndex < 0) {
    return;
  }
  const dictionary = activeDictionary();
  if (!dictionary) {
    return;
  }
  const next = advancedFilter.variants[nextIndex];
  advancedFilter = {
    ...advancedFilter,
    title: next.title,
    entryIds: next.entryIds,
    issueMap: next.issueMap,
    meta: next.key && advancedFilter.meta ? { ...advancedFilter.meta, activeKey: next.key } : advancedFilter.meta,
    variantIndex: nextIndex,
  };
  const ids = new Set(advancedFilter.entryIds);
  if (!ids.has(state.selectedEntryId)) {
    const firstEntry = [...dictionary.entries].filter((entry) => ids.has(entry.id)).sort(compareEntries)[0];
    state.selectedEntryId = firstEntry?.id || state.selectedEntryId;
  }
  revealEntryBrowserForResults();
  render();
  scheduleEntryCardScroll(state.selectedEntryId);
}

function entryMatchesSearch(entry, dictionary = activeDictionary(), options = {}) {
  const query = options.query ?? searchQuery;
  const searchOptions = entrySearchQueryOptions(dictionary);
  const fields = options.fields ?? searchOptions.fields;
  const fuzzyFields = options.fuzzyFields ?? searchOptions.fuzzyFields;
  const respectPart = options.respectPart ?? true;
  const parts = entryParts(entry, dictionary);
  const matchesPart = !respectPart
    || !activePart
    || (activePart === NO_PART_FILTER_VALUE ? !parts.length : parts.includes(activePart));
  return matchesPart && entrySearchModel.entryMatchesSearchText(entry, dictionary, query, {
    normalizeText: searchOptions.normalizeText,
    fields,
    fuzzyFields,
  });
}

function dictionaryStatsText(dictionary) {
  if (!dictionary) {
    return "";
  }
  return `${dictionaryEntryCount(dictionary)} ${t("entries")} · ${dictionaryRootCountSummary(dictionary)} ${t("roots")}`;
}

function dictionaryEntryCount(dictionary) {
  const summaryCount = dictionary?.summary?.entryCount;
  return Number.isFinite(summaryCount) ? summaryCount : dictionary?.entries?.length || 0;
}

function dictionaryRootCountSummary(dictionary) {
  const summaryCount = dictionary?.summary?.rootCount;
  return Number.isFinite(summaryCount) ? summaryCount : dictionaryRootCount(dictionary);
}

function dictionaryRootCount(dictionary) {
  return entryRelationsModel.rootCount(dictionary, { normalizeText: normalize, compareEntries });
}

function rootModeGroups(dictionary = activeDictionary(), options = {}) {
  if (!dictionary) {
    return [];
  }
  const searchOptions = entrySearchQueryOptions(dictionary);
  const query = options.query ?? searchQuery;
  const normalizedQuery = searchOptions.normalizeText(query);
  const { fields, fuzzyFields } = searchOptions;
  const matchOptions = {
    query,
    fields,
    fuzzyFields,
    respectPart: false,
  };
  return entryRelationsModel.rootModeGroups(dictionary, {
    query: normalizedQuery,
    normalizeText: normalize,
    compareEntries,
    matchesEntry: (entry) => entryMatchesSearch(entry, dictionary, matchOptions),
  });
}

function entryHasSources(entry) {
  return entryRelationsModel.entryHasSources(entry);
}

function sourceRootEntries(entry, dictionary = activeDictionary(), seen = new Set()) {
  return entryRelationsModel.sourceRootEntries(entry, dictionary, { normalizeText: normalize, compareEntries }, seen);
}

function compareEntries(a, b) {
  const lemmaCompare = a.lemma.localeCompare(b.lemma, "zh-CN");
  const updatedCompare = new Date(a.updatedAt || 0).getTime() - new Date(b.updatedAt || 0).getTime();
  const createdCompare = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();

  switch (entrySort) {
    case "lemmaDesc":
      return -lemmaCompare;
    case "updatedAsc":
      return updatedCompare || lemmaCompare;
    case "updatedDesc":
      return -updatedCompare || lemmaCompare;
    case "createdAsc":
      return createdCompare || lemmaCompare;
    case "createdDesc":
      return -createdCompare || lemmaCompare;
    case "lemmaAsc":
    default:
      return lemmaCompare;
  }
}

function textMatches(text, query, fuzzyEnabled = false) {
  const searchOptions = entrySearchQueryOptions();
  return entrySearchModel.textMatches(text, query, {
    fuzzy: Boolean(fuzzyEnabled),
    normalizeText: searchOptions.normalizeText,
  });
}

function highlightSearchText(value, fuzzyEnabled = false, searchEnabled = true) {
  const text = String(value || "");
  const searchOptions = entrySearchQueryOptions();
  const query = searchOptions.normalizeText(searchQuery);
  if (!normalizeDictionarySettings(activeDictionary()?.settings).searchHighlight) {
    return escapeHtml(text);
  }
  if (!text || !query || !searchEnabled) {
    return escapeHtml(text);
  }

  const normalized = searchOptions.normalizeTextWithMap(text);
  const normalizedText = normalized.text;
  let normalizedCursor = 0;
  let index = normalizedText.indexOf(query, normalizedCursor);
  if (index >= 0) {
    const ranges = [];
    while (index >= 0) {
      const covered = normalized.map.slice(index, index + query.length);
      if (covered.length) {
        ranges.push({
          start: Math.min(...covered.map((item) => item.start)),
          end: Math.max(...covered.map((item) => item.end)),
        });
      }
      normalizedCursor = index + query.length;
      index = normalizedText.indexOf(query, normalizedCursor);
    }
    const merged = ranges.reduce((result, range) => {
      const previous = result[result.length - 1];
      if (previous && range.start <= previous.end) {
        previous.end = Math.max(previous.end, range.end);
      } else {
        result.push({ ...range });
      }
      return result;
    }, []);
    const html = [];
    let cursor = 0;
    merged.forEach((range) => {
      html.push(escapeHtml(text.slice(cursor, range.start)));
      html.push(`<mark>${escapeHtml(text.slice(range.start, range.end))}</mark>`);
      cursor = range.end;
    });
    html.push(escapeHtml(text.slice(cursor)));
    return html.join("");
  }

  if (!fuzzyEnabled || fuzzyScore(text, query) <= 0) {
    return escapeHtml(text);
  }
  return highlightFuzzyText(text, query);
}

function highlightFuzzyText(value, query) {
  const text = String(value || "");
  const normalizeSearch = entrySearchQueryOptions().normalizeText;
  let queryIndex = 0;
  let html = "";
  for (const char of text) {
    if (queryIndex < query.length && normalizeSearch(char) === query[queryIndex]) {
      html += `<mark>${escapeHtml(char)}</mark>`;
      queryIndex += 1;
    } else {
      html += escapeHtml(char);
    }
  }
  return html;
}

function renderEntrySearchSnippets(entry) {
  const dictionary = activeDictionary();
  const searchOptions = entrySearchQueryOptions(dictionary);
  const query = searchQuery;
  if (!searchOptions.normalizeText(query)) {
    return "";
  }
  const { fields: searchFields, fuzzyFields } = searchOptions;
  const labels = {
    definitions: t("meaning"),
    examples: t("example"),
    notes: t("entryNotes"),
    etymology: t("etymology"),
    morphology: t("morphologyDisplay"),
  };
  const firstDisplayedDefinitionIndex = entryDefinitionItems(entry).findIndex((definition) => (
    Boolean(String(definition?.meaning || "").trim())
  ));
  const labelOrder = Object.keys(labels);
  const apiHits = Array.isArray(entry.searchHits) ? entry.searchHits : null;
  const candidates = apiHits
    ? apiHits
        .filter((hit) => Object.hasOwn(labels, hit.field))
        .sort((left, right) => labelOrder.indexOf(left.field) - labelOrder.indexOf(right.field))
        .map((hit) => ({
          field: hit.field,
          label: labels[hit.field],
          value: hit.value,
          index: Number(hit.sourcePosition) || 0,
        }))
        .filter(({ field, index }) => field !== "definitions" || index !== firstDisplayedDefinitionIndex)
    : (() => {
        const valuesByField = entrySearchModel.entrySearchFieldValues(entry, dictionary, {
          fields: searchFields,
          normalizeText: searchOptions.normalizeText,
        });
        return Object.entries(labels)
          .flatMap(([field, label]) => valuesByField[field].map((value, index) => ({ field, label, value, index })))
          .filter(({ field, value, index }) => (
            value
            && entrySearchModel.textMatches(value, query, {
              fuzzy: fuzzyFields.has(field),
              normalizeText: searchOptions.normalizeText,
            })
            && (field !== "definitions" || index !== firstDisplayedDefinitionIndex)
          ));
      })();
  const snippets = candidates
    .slice(0, 2)
    .map(({ field, label, value, index }) => `
      <span class="search-snippet">
        <b>${escapeHtml(field === "definitions"
          ? (currentLanguage === "zh" ? `${label}${index + 1}` : `${label} ${index + 1}`)
          : label)}</b>
        ${highlightSearchText(compactSearchSnippet(value), fuzzyFields.has(field), true)}
      </span>
    `)
    .join("");
  return snippets ? `<div class="search-snippets">${snippets}</div>` : "";
}

function compactSearchSnippet(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > 72 ? `${text.slice(0, 69)}...` : text;
}

function fuzzyScore(value, query) {
  return entrySearchModel.fuzzyScore(value, query, { normalizeText: entrySearchQueryOptions().normalizeText });
}

function renderDetail() {
  const dictionary = activeDictionary();
  const isEditing = editorMode === "edit";

  if (!dictionary) {
    finishStaleContentUpdate("detail");
    entryDetailHasSettledContent = false;
    elements.entryDisplay.hidden = true;
    elements.entryForm.hidden = true;
    return;
  }

  if (isEditing) {
    finishStaleContentUpdate("detail");
    elements.entryDisplay.hidden = true;
    elements.entryForm.hidden = false;
    fillEntryForm(selectedEntry() || entryDraft);
    return;
  }

  const detailStateMatchesSelection = selectedEntryDetailState.dictionaryId === dictionary.id
    && selectedEntryDetailState.entryId === state.selectedEntryId;
  if (
    state.selectedEntryId
    && !selectedEntry()
    && !(detailStateMatchesSelection && selectedEntryDetailState.status === "error")
  ) {
    ensureSelectedEntryDetailLoaded();
  }
  const entry = selectedEntry();
  const retainingStaleDetail = Boolean(
    !entry
    && selectedEntryDetailState.dictionaryId === dictionary.id
    && selectedEntryDetailState.entryId === state.selectedEntryId
    && selectedEntryDetailState.status === "loading"
    && selectedEntryDetailState.staleEntry
    && staleContentUpdateRetainsContent("detail")
  );

  elements.entryForm.hidden = true;
  if (retainingStaleDetail) {
    elements.entryDisplay.hidden = false;
    return;
  }

  elements.entryDisplay.hidden = !entry && !state.selectedEntryId;

  if (!entry) {
    elements.entryDisplay.hidden = false;
    renderEmptyDetail();
    entryDetailHasSettledContent = false;
    if (state.selectedEntryId) {
      if (selectedEntryDetailState.status === "error") {
        elements.displayLemma.textContent = aText("无法加载词条详情", "Could not load entry details");
      } else {
        elements.displayLemma.textContent = aText("加载中", "Loading");
      }
    }
    return;
  }

  elements.entryDisplay.hidden = false;
  renderEntryDisplay(entry);
  entryDetailHasSettledContent = true;
}

function renderEmptyDetail() {
  elements.displayLemma.textContent = t("noEntries");
  elements.displayPronunciation.textContent = "";
  elements.displayPronunciation.hidden = true;
  elements.displayPart.textContent = "";
  elements.displayPart.hidden = true;
  elements.displayPart.classList.remove("highlight-tag");
  delete elements.displayPart.dataset.entryTagIndex;
  delete elements.displayPart.dataset.entryTagValue;
  elements.displayTags.innerHTML = "";
  elements.displayDefinitionsSection.hidden = false;
  elements.displayDefinitions.innerHTML = "";
  elements.displayDefinitions.append(emptyState(t("noEntries"), t("noEntriesBody")));
  elements.displayEtymologySection.hidden = true;
  elements.displayDerivedSection.hidden = true;
  elements.displayMorphologySection.hidden = true;
  elements.displayEntryNotesSection.hidden = true;
  elements.editEntryButton.hidden = true;
  elements.openLexicalNetworkButton.hidden = true;
}

function renderEntryDisplay(entry) {
  const showEmptySections = normalizeDictionarySettings(activeDictionary()?.settings).showEmptyEntrySections;
  const partTags = (entry.tags || [])
    .map((tag, index) => ({ tag, index }))
    .filter(({ tag, index }) => entryTagIsPart(entry, index, tag));
  const otherTags = (entry.tags || [])
    .map((tag, index) => ({ tag, index }))
    .filter(({ tag, index }) => !entryTagIsPart(entry, index, tag));
  elements.editEntryButton.hidden = false;
  elements.openLexicalNetworkButton.hidden = false;
  elements.displayLemma.textContent = entry.lemma;
  elements.displayPronunciation.textContent = entry.pronunciation;
  elements.displayPronunciation.hidden = !entry.pronunciation;
  elements.displayPart.innerHTML = partTags
    .map(({ tag, index }) => `<span class="part-badge-item${tagIsRedHighlighted(tag) ? " highlight-tag" : ""}" data-entry-tag-index="${index}" data-entry-tag-value="${escapeHtml(tag)}">${escapeHtml(displayTag(tag))}</span>`)
    .join("");
  elements.displayPart.hidden = !partTags.length;
  elements.displayPart.classList.remove("highlight-tag");
  delete elements.displayPart.dataset.entryTagIndex;
  delete elements.displayPart.dataset.entryTagValue;
  elements.displayTags.innerHTML = otherTags
    .map(({ tag, index }) => `<span class="outline-chip${tagIsRedHighlighted(tag) ? " highlight-tag" : ""}" data-entry-tag-index="${index}" data-entry-tag-value="${escapeHtml(tag)}">${escapeHtml(displayTag(tag))}</span>`)
    .join("");

  elements.displayDefinitions.innerHTML = "";
  const visibleDefinitions = (entry.definitions || []).filter((definition) => definition.meaning || definition.example || definition.note);
  elements.displayDefinitionsSection.hidden = !visibleDefinitions.length && !showEmptySections;
  if (!visibleDefinitions.length) {
    elements.displayDefinitions.append(emptyState(t("missingDefinition"), ""));
  }
  visibleDefinitions.forEach((definition, index) => {
    const item = document.createElement("article");
    item.className = "definition-display-card";
    item.innerHTML = `
      <div class="definition-number">${index + 1}</div>
      <div class="definition-content">
        <p class="definition-meaning">${escapeHtml(definition.meaning)}</p>
        ${definition.example ? `<div class="example-box"><span>${escapeHtml(t("example"))}</span>${renderExampleHtml(definition.example, activeDictionary()?.settings)}</div>` : ""}
        ${definition.note ? `<div class="definition-note"><span>${escapeHtml(t("definitionNote"))}</span><p>${escapeHtml(definition.note)}</p></div>` : ""}
      </div>
    `;
    elements.displayDefinitions.append(item);
  });

  renderEntryRelationSections(entry, showEmptySections);
  renderMorphologyDisplay(entry, showEmptySections);
  elements.displayEntryNotesSection.hidden = !entry.notes && !showEmptySections;
  elements.displayEntryNotes.textContent = entry.notes || "";
  applyEntryDisplaySectionOrder();
}

function applyEntryDisplaySectionOrder() {
  const sections = {
    definitions: elements.displayDefinitionsSection,
    etymology: elements.displayEtymologySection,
    derived: elements.displayDerivedSection,
    morphology: elements.displayMorphologySection,
    notes: elements.displayEntryNotesSection,
  };
  normalizeEntrySectionOrder(activeDictionary()?.settings?.entrySectionOrder)
    .forEach((section) => elements.entryDisplay.append(sections[section]));
}

function renderEntryRelationSections(entry, showEmptySections = false) {
  const relationState = entryRelationStateForEntry(activeDictionary(), entry);
  renderEtymology(entry, showEmptySections, relationState);
  renderDerivedEntries(entry, relationState);
}

function renderEtymology(entry, showEmptySections = false, relationState = { status: "loading", relation: null }) {
  const sources = entry.etymology?.sources || [];
  const description = entry.etymology?.description || "";
  elements.displayEtymologySection.hidden = !sources.length && !description && !showEmptySections;
  elements.displayEtymology.innerHTML = "";

  if (sources.length) {
    const sourceRow = document.createElement("div");
    sourceRow.className = "source-row";
    const resolvedSources = relationState.status === "success"
      ? relationState.relation.sources || []
      : sources.map((sourceText) => ({ sourceText, matchedEntryId: "", matchedLemma: "" }));
    resolvedSources.forEach((sourceRelation) => {
      const sourceName = sourceRelation.sourceText || "";
      if (relationState.status === "success" && sourceRelation.matchedEntryId) {
        const button = document.createElement("button");
        button.className = "source-link";
        button.type = "button";
        button.textContent = sourceRelation.matchedLemma || sourceName;
        button.addEventListener("click", () => switchToEntry(sourceRelation.matchedEntryId));
        sourceRow.append(button);
      } else if (relationState.status === "success") {
        const pending = document.createElement("button");
        pending.type = "button";
        pending.className = "source-link pending-source";
        pending.textContent = sourceName;
        pending.setAttribute("aria-label", formatText("createSourceEntry", { source: sourceName }));
        pending.addEventListener("click", () => beginSourceEntry(sourceName));
        sourceRow.append(pending);
      } else {
        const loading = document.createElement("span");
        loading.className = "source-link pending-source";
        loading.textContent = sourceName;
        sourceRow.append(loading);
      }
    });
    elements.displayEtymology.append(sourceRow);
  }

  if (description) {
    const paragraph = document.createElement("p");
    paragraph.textContent = description;
    elements.displayEtymology.append(paragraph);
  }
}

async function beginSourceEntry(sourceName) {
  const lemma = String(sourceName || "").trim();
  if (!lemma) {
    return false;
  }
  return beginNewEntry({ lemma });
}

function renderDerivedEntries(entry, relationState = entryRelationStateForEntry(activeDictionary(), entry)) {
  const derived = relationState.status === "success" ? relationState.relation.derivedEntries || [] : [];
  elements.displayDerivedSection.hidden = !derived.length;
  renderDerivedEntryList(elements.displayDerived, derived, activeDictionary(), { interactive: true });
}

function renderFullEditDerivedEntries(entry) {
  const relationState = entry?.id
    ? entryRelationStateForEntry(activeDictionary(), entry)
    : { status: "idle", relation: null };
  const derived = relationState.status === "success" ? relationState.relation.derivedEntries || [] : [];
  elements.fullEditDerivedSection.hidden = !derived.length;
  renderDerivedEntryList(elements.fullEditDerived, derived, activeDictionary(), { interactive: false });
}

function renderDerivedEntryList(container, derived = [], dictionary = activeDictionary(), { interactive = true } = {}) {
  container.innerHTML = "";
  derived.forEach((derivedEntry) => {
    const card = document.createElement(interactive ? "button" : "div");
    if (interactive) {
      card.type = "button";
    }
    card.className = interactive ? "derived-link" : "derived-link derived-readonly";
    const partText = entryPartText(derivedEntry, dictionary);
    card.innerHTML = `
      <strong>${escapeHtml(derivedEntry.lemma)}</strong>
      ${partText ? `<span>${escapeHtml(partText)}</span>` : ""}
    `;
    if (interactive) {
      card.addEventListener("click", () => switchToEntry(derivedEntry.id));
    }
    container.append(card);
  });
}

async function openLexicalNetwork() {
  const ready = await closePendingEditsForPageSwitch();
  if (!ready) {
    return;
  }

  const entry = selectedEntry();
  if (!entry) {
    return;
  }
  networkEntryId = entry.id;
  networkOpen = true;
  editorMode = "display";
  renderLexicalNetwork();
}

function closeLexicalNetwork() {
  let targetEntryId = "";
  let navigationOptions = {};
  if (networkEntryId) {
    targetEntryId = networkEntryId;
    navigationOptions = prepareRootModeEntryNavigation(targetEntryId);
    state.selectedEntryId = targetEntryId;
    editorMode = "display";
  }
  networkOpen = false;
  if (targetEntryId) {
    ensureSelectedEntryDetailLoaded();
  }
  renderEditorEntrySelection();
  if (targetEntryId) {
    scheduleEntryCardScroll(targetEntryId, navigationOptions);
  }
}

function navigateLexicalNetwork(entryId) {
  if (!entryId || entryId === networkEntryId) {
    return;
  }
  elements.lexicalNetworkPanel.classList.add("moving");
  window.setTimeout(() => {
    networkEntryId = entryId;
    renderLexicalNetwork();
    elements.lexicalNetworkPanel.classList.remove("moving");
  }, 160);
}

function renderLexicalNetwork() {
  elements.lexicalNetworkOverlay.hidden = !networkOpen;
  if (!networkOpen) {
    return;
  }

  const dictionary = activeDictionary();
  const entry = dictionary?.entries.find((item) => item.id === networkEntryId) || selectedEntry();
  if (!dictionary || !entry) {
    elements.lexicalNetworkOverlay.hidden = true;
    networkOpen = false;
    return;
  }

  networkEntryId = entry.id;
  elements.networkTitle.textContent = entry.lemma;
  const relation = lexicalNetworkRelationForEntry(dictionary, entry);

  renderNetworkNodeList(elements.networkSources, relation.sources, relation.status);
  renderNetworkNodeList(elements.networkDerived, relation.derivedEntries, relation.status);
  elements.networkFocus.innerHTML = "";
  elements.networkFocus.append(createNetworkNode(entry, true));
}

function entryRelationKey(dictionary, entryId) {
  return [
    dictionary?.id || "",
    entryId || "",
    dictionary?.updatedAt || "",
  ].join("|");
}

function entryRelationStateForEntry(dictionary, entry) {
  if (!backendAvailable || !dictionary?.id || !entry?.id) {
    return { status: "error", relation: null };
  }

  const key = entryRelationKey(dictionary, entry.id);
  const cached = entryRelationsCache.get(key);
  if (cached) {
    entryRelationsCache.delete(key);
    entryRelationsCache.set(key, cached);
  }
  if (cached?.status === "success") {
    return { status: "success", relation: cached.relation };
  }
  if (!cached) {
    fetchEntryRelation(dictionary, entry, key);
  }
  return {
    status: cached?.status || "loading",
    relation: null,
  };
}

function lexicalNetworkRelationForEntry(dictionary, entry) {
  const relationState = entryRelationStateForEntry(dictionary, entry);
  if (relationState.status !== "success") {
    return { status: relationState.status, sources: [], derivedEntries: [], rootGroup: null };
  }
  return { status: "success", ...apiLexicalNetworkRelation(relationState.relation) };
}

function apiLexicalNetworkRelation(relation) {
  const relatedEntries = [
    ...(relation.derivedEntries || []),
    ...(relation.rootGroup?.entries || []),
    ...(relation.sources || []).map((source) => source.matchedEntry).filter(Boolean),
  ];
  const byId = new Map(relatedEntries.map((entry) => [entry.id, entry]));
  return {
    sources: (relation.sources || [])
      .map((source) => source.matchedEntry || byId.get(source.matchedEntryId))
      .filter(Boolean),
    derivedEntries: relation.derivedEntries || [],
    rootGroup: relation.rootGroup || null,
  };
}

function refreshEntryRelationConsumers(entryId, key) {
  if (entryRelationKey(activeDictionary(), entryId) !== key) {
    return;
  }
  const entry = selectedEntry();
  if (entry?.id === entryId) {
    if (editorMode === "edit") {
      renderFullEditDerivedEntries(entry);
    } else {
      const showEmptySections = normalizeDictionarySettings(activeDictionary()?.settings).showEmptyEntrySections;
      renderEntryRelationSections(entry, showEmptySections);
    }
  }
  if (networkOpen && networkEntryId === entryId) {
    renderLexicalNetwork();
  }
}

function fetchEntryRelation(dictionary, entry, key) {
  entryRelationsCache.set(key, { status: "loading", relation: null, error: null });
  trimEntryRelationsCache(key);
  api(`/api/dictionaries/${encodeURIComponent(dictionary.id)}/entry-relations/${encodeURIComponent(entry.id)}`)
    .then((relation) => {
      entryRelationsCache.set(key, { status: "success", relation, error: null });
      refreshEntryRelationConsumers(entry.id, key);
    })
    .catch((error) => {
      entryRelationsCache.set(key, { status: "error", relation: null, error });
      console.error("Entry relations API unavailable.", error);
      refreshEntryRelationConsumers(entry.id, key);
    });
}

function trimEntryRelationsCache(protectedKey = "") {
  while (entryRelationsCache.size > ENTRY_RELATIONS_CACHE_MAX) {
    const oldestKey = entryRelationsCache.keys().next().value;
    if (!oldestKey) {
      return;
    }
    if (oldestKey === protectedKey) {
      const protectedValue = entryRelationsCache.get(oldestKey);
      entryRelationsCache.delete(oldestKey);
      entryRelationsCache.set(oldestKey, protectedValue);
      continue;
    }
    entryRelationsCache.delete(oldestKey);
  }
}

function renderNetworkNodeList(container, entries, status = "success") {
  container.innerHTML = "";
  if (status === "loading") {
    container.append(emptyState(t("lexicalNetworkLoading"), ""));
    return;
  }
  if (status === "error") {
    container.append(emptyState(t("lexicalNetworkLoadFailed"), ""));
    return;
  }
  if (!entries.length) {
    container.append(emptyState(t("none"), ""));
    return;
  }
  entries.forEach((entry) => container.append(createNetworkNode(entry, false)));
}

function createNetworkNode(entry, isFocus = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `network-node${isFocus ? " focus" : ""}`;
  const partText = entryPartText(entry);
  const settings = normalizeDictionarySettings(activeDictionary()?.settings);
  const meaningHtml = renderNetworkMeaningHtml(entry, settings.networkPolysemyDisplay);
  button.innerHTML = `
    <strong>${escapeHtml(entry.lemma)}</strong>
    <span>${escapeHtml([entry.pronunciation, partText].filter(Boolean).join(" · "))}</span>
    <div class="network-card" role="tooltip">
      <b>${escapeHtml(entry.lemma)}</b>
      ${entry.pronunciation ? `<span>${escapeHtml(entry.pronunciation)}</span>` : ""}
      ${partText ? `<span>${escapeHtml(partText)}</span>` : ""}
      ${meaningHtml}
    </div>
  `;
  button.addEventListener("click", () => navigateLexicalNetwork(entry.id));
  return button;
}

function renderNetworkMeaningHtml(entry, showPolysemy = false) {
  const meanings = entryDefinitionMeanings(entry);
  const preview = entryDefinitionItems(entry).map((definition) => definition.meaning).find(Boolean) || "";
  if (!meanings.length && preview) {
    return `<div class="network-definition-list"><p>${escapeHtml(preview)}</p></div>`;
  }
  if (!meanings.length) {
    return "";
  }
  const visibleMeanings = showPolysemy ? meanings : meanings.slice(0, 1);
  const numbered = showPolysemy && visibleMeanings.length > 1;
  return `<div class="network-definition-list">${visibleMeanings.map((meaning, index) => `
    <p>${escapeHtml(numbered ? `${index + 1}. ${meaning}` : meaning)}</p>
  `).join("")}</div>`;
}

function glossStyleClassNames(key, settings) {
  const style = settings.glossStyles[key];
  return [
    `gloss-${key}`,
    `gloss-font-${style.fontFamily}`,
    `gloss-size-${style.fontSize}`,
    style.bold ? "gloss-is-bold" : "gloss-not-bold",
    style.italic ? "gloss-is-italic" : "gloss-not-italic",
  ].join(" ");
}

function renderGlossTokenText(key, value, settings) {
  return key === "glb" && settings.glossStyles.glb.smallCaps
    ? renderSmallCaps(value)
    : escapeHtml(value);
}

function renderExampleHtml(example, rawSettings = {}) {
  const settings = normalizeDictionarySettings(rawSettings);
  const pattern = parseCorpusRenderPattern(settings.entryExampleRenderPattern);
  if (pattern.error) {
    return `<p class="corpus-unit-render-error" title="${escapeHtml(pattern.error)}">${escapeHtml(t("corpusRenderError"))}</p>`;
  }
  if (!pattern.groups.length) {
    return `<p>${escapeHtml(example).replaceAll("\n", "<br>")}</p>`;
  }
  const gloss = parseGloss(example);
  if (!gloss) {
    return `<p>${escapeHtml(example).replaceAll("\n", "<br>")}</p>`;
  }
  if (!corpusGlossHasTargets(gloss, pattern.groups)) {
    return `<p class="corpus-unit-render-error">${escapeHtml(t("corpusRenderError"))}</p>`;
  }
  return `<div class="gloss-block">${renderCorpusGlossRows(pattern.groups, gloss, settings, settings.entryExampleGlossAlign)}</div>`;
}

function parseGloss(example) {
  return qualityModel.parseGloss(example);
}

function renderSmallCaps(value) {
  return String(value || "").replace(/[a-z0-9]+|[&<>"']/g, (match) => {
    if (/^[a-z0-9]+$/.test(match)) {
      return `<span class="smallcaps">${match}</span>`;
    }
    return escapeHtml(match);
  });
}

function entryListTagItems(entry, { includePartTags = true, dictionary = activeDictionary() } = {}) {
  return (entry.tags || [])
    .map((tag, index) => ({ tag, index }))
    .filter(({ tag, index }) => includePartTags || !entryTagIsPart(entry, index, tag, dictionary));
}

function renderChips(entry, limit = 4, highlight = false, fuzzyEnabled = false, clickable = false, { includePartTags = true } = {}) {
  const tags = entryListTagItems(entry, { includePartTags });
  const settings = normalizeDictionarySettings(activeDictionary()?.settings);
  const hasHiddenTags = tags.length > limit;
  const visibleLimit = hasHiddenTags ? Math.max(1, limit - 1) : limit;
  const chips = tags
    .slice(0, visibleLimit)
    .map(({ tag, index }) => {
      const text = entryListDisplayTag(tag, settings);
      const classes = ["chip", entryTagIsPart(entry, index, tag) ? "part-chip" : "", tagIsRedHighlighted(tag) ? "highlight-tag" : ""].filter(Boolean).join(" ");
      const tagAttributes = clickable
        ? ` data-entry-tag-index="${index}" data-entry-tag-value="${escapeHtml(tag)}"`
        : "";
      const tooltipHtml = renderEntryListTagTooltipHtml(tag, classes);
      const tooltipAttributes = ` data-app-tooltip="always" data-app-tooltip-wrap="true" data-app-tooltip-variant="tag-info" data-app-tooltip-html="${escapeHtml(tooltipHtml)}" aria-label="${escapeHtml(text)}"`;
      const contentHtml = highlight ? highlightSearchText(text, fuzzyEnabled) : escapeHtml(text);
      return `<span class="${classes}"${tagAttributes}${tooltipAttributes}><span class="chip-label">${contentHtml}</span></span>`;
    })
    .join("");
  const hiddenTagTitle = hasHiddenTags
    ? tags.slice(visibleLimit).map(({ tag }) => entryListDisplayTag(tag, settings)).join(", ")
    : "";
  const hiddenTagTooltipHtml = hasHiddenTags
    ? `<span class="app-tooltip-chip-list">${tags.slice(visibleLimit).map(({ tag, index }) => {
      const classes = ["chip", entryTagIsPart(entry, index, tag) ? "part-chip" : "", tagIsRedHighlighted(tag) ? "highlight-tag" : ""].filter(Boolean).join(" ");
      return `<span class="${classes}">${escapeHtml(entryListDisplayTag(tag, settings))}</span>`;
    }).join("")}</span>`
    : "";
  const ellipsisChip = hasHiddenTags
    ? `<span class="chip ellipsis-chip" data-app-tooltip="always" data-app-tooltip-wrap="true" data-app-tooltip-variant="chip-list" data-app-tooltip-html="${escapeHtml(hiddenTagTooltipHtml)}" tabindex="0" aria-label="${escapeHtml(hiddenTagTitle)}">...</span>`
    : "";
  return `${chips}${ellipsisChip}`;
}

function renderEntryListTagTooltipHtml(tag, chipClasses) {
  const raw = String(tag || "");
  const replacement = displayTag(raw);
  const rows = [
    renderTagTooltipRow(t("tagTooltipRawTag"), raw, chipClasses),
  ];
  if (replacement !== raw) {
    rows.push(renderTagTooltipRow(t("tagTooltipDisplayReplacement"), replacement, chipClasses));
  }
  return `<span class="app-tooltip-tag-info">${rows.join("")}</span>`;
}

function renderTagTooltipRow(label, value, chipClasses) {
  return `
    <span class="tag-tooltip-row">
      <span class="tag-tooltip-label">${escapeHtml(label)}</span>
      <span class="${chipClasses}">${escapeHtml(value)}</span>
    </span>
  `;
}

function morphologyTables(dictionary = activeDictionary()) {
  return normalizeMorphology(dictionary?.morphology).tables;
}

function resolveEntryMorphologyTable(entry, dictionary = activeDictionary()) {
  const selected = entry?.morphology?.tableId || "auto";
  if (selected === "none") {
    return null;
  }
  const tables = morphologyTables(dictionary);
  if (selected !== "auto") {
    return tables.find((table) => table.id === selected) || null;
  }
  const entryTags = new Set((entry?.tags || []).map(searchNormalizationModel.normalizeStructuralKey));
  return tables.find((table) => table.matchTags.some((tag) => entryTags.has(searchNormalizationModel.normalizeStructuralKey(tag)))) || null;
}

function morphologyCellValue(entry, table, row, col, dictionary = activeDictionary()) {
  const key = morphologyCellKey(row, col);
  const override = entry?.morphology?.overrides?.[key];
  return override || morphologyCellDefaultValue(entry, table, row, col, dictionary);
}

function morphologyCellDefaultValue(entry, table, row, col, dictionary = activeDictionary()) {
  const key = morphologyCellKey(row, col);
  const rule = String(table?.cells?.[key]?.value || "").trim();
  if (!rule) {
    return "";
  }
  return applyMorphologyRuleSyntax(entry?.lemma || "", rule, morphologyFunctionConfig(dictionary));
}

function morphologyFunctionConfig(dictionary = activeDictionary()) {
  return normalizeMorphology(dictionary?.morphology).functions;
}

function applyMorphologyRuleSyntax(lemma, rule, functions = normalizeMorphologyFunctions()) {
  return morphologyModel.applyMorphologyRuleSyntax(lemma, rule, functions);
}

function morphologySearchStrings(entry, dictionary = activeDictionary()) {
  return morphologyModel.morphologySearchStrings(entry, dictionary);
}

function renderAnalysis(dictionary = activeDictionary()) {
  if (!elements.analysisPanel) {
    return;
  }
  disconnectMasonryLayoutsWithin(elements.analysisPanel);
  if (!dictionary) {
    elements.analysisPanel.innerHTML = "";
    return;
  }

  analysisFilterRegistry.clear();
  analysisFilterCounter = 0;
  const page = activeAnalysisPage();
  const subpage = activeAnalysisSubpage(page);
  const report = getAnalysisReport(dictionary, { page, subpage });
  elements.analysisPanel.innerHTML = renderAnalysisPage(report, page, subpage);
  setupAnalysisMasonryLayouts();
}

function activeAnalysisPage() {
  const analysisViewState = activeAnalysisViewState();
  const page = ["overview", "entries", "ipa", "morphology", "activity"].includes(analysisViewState.page)
    ? analysisViewState.page
    : "overview";
  analysisViewState.page = page;
  return page;
}

function getAnalysisReport(dictionary, route = {}) {
  const page = route.page || activeAnalysisPage();
  const subpage = route.subpage ?? activeAnalysisSubpage(page);
  return buildAnalysisReportForRoute(dictionary, page, subpage);
}

function analysisBaseCacheKey(dictionary) {
  return stableJson({
    dictionaryId: dictionary?.id || "",
    dictionaryUpdatedAt: dictionary?.updatedAt || "",
    language: currentLanguage,
    settings: dictionary?.settings || {},
    morphology: dictionary?.morphology || {},
    entries: (dictionary?.entries || []).map((entry) => ({
      id: entry.id || "",
      lemma: entry.lemma || "",
      pronunciation: entry.pronunciation || "",
      tags: entry.tags || [],
      definitions: (entry.definitions || []).map((definition) => ({
        id: definition.id || "",
        meaning: definition.meaning || "",
        example: definition.example || "",
      })),
      notes: entry.notes || "",
      etymology: {
        sources: entry.etymology?.sources || [],
      },
      morphologyGroups: entry.morphologyGroups || [],
      createdAt: entry.createdAt || "",
      updatedAt: entry.updatedAt || "",
    })),
  });
}

function analysisSliceCacheKey(context, dep) {
  return stableJson({
    base: context.cacheBaseKey,
    dep,
    searchQuery: dep === "search" ? normalizeEntrySearchText(searchQuery, context.dictionary) : "",
    entrySort: dep === "relation" || dep === "rootFamilies" ? entrySort : "",
    rootFamilyLimit: dep === "rootFamilies" ? analysisRootFamilyLimit() : "",
  });
}

function analysisRootFamilyLimit() {
  return DEFAULT_ANALYSIS_ROOT_FAMILY_LIMIT;
}

function renderQuality(dictionary = activeDictionary()) {
  if (!elements.qualityPanel) {
    return;
  }
  disconnectMasonryLayoutsWithin(elements.qualityPanel);
  if (!dictionary) {
    elements.qualityPanel.innerHTML = "";
    return;
  }

  analysisFilterRegistry.clear();
  analysisFilterCounter = 0;
  const report = getQualityViewReport(dictionary);
  elements.qualityPanel.innerHTML = renderQualityPage(report);
  setupQualityMasonryLayouts();
}

function getQualityViewReport(dictionary) {
  const key = qualityReportCacheKey(dictionary);
  if (qualityReportCache?.key === key) {
    return qualityReportCache.report;
  }
  const report = buildQualityViewReport(dictionary);
  qualityReportCache = { key, report };
  return report;
}

function qualityReportCacheKey(dictionary) {
  return stableJson({
    dictionaryId: dictionary?.id || "",
    dictionaryUpdatedAt: dictionary?.updatedAt || "",
    language: currentLanguage,
    settings: {
      ipa: dictionary?.settings?.ipa || {},
    },
    entries: (dictionary?.entries || []).map((entry) => ({
      id: entry.id || "",
      lemma: entry.lemma || "",
      pronunciation: entry.pronunciation || "",
      tags: entry.tags || [],
      definitions: (entry.definitions || []).map((definition) => ({
        id: definition.id || "",
        meaning: definition.meaning || "",
        example: definition.example || "",
      })),
      etymology: {
        sources: entry.etymology?.sources || [],
      },
      updatedAt: entry.updatedAt || "",
    })),
  });
}

function renderAnalysisPage(report, page = activeAnalysisPage(), subpage = activeAnalysisSubpage(page)) {
  return `
    ${analysisPageNav(page)}
    ${analysisSubpageNav(page, subpage, report)}
    <section class="analysis-page-body">
      ${analysisPageBody(report, page, subpage)}
    </section>
  `;
}

function analysisPageNav(activePage) {
  const pages = [
    ["overview", aText("总览", "Overview")],
    ["entries", aText("词条与标签", "Entries & Tags")],
    ["ipa", "IPA"],
    ["morphology", aText("形态学", "Morphology")],
    ["activity", aText("编辑进度", "Activity")],
  ];
  return `<nav class="analysis-page-tabs">${pages.map(([page, label]) => `
    <button type="button" class="${page === activePage ? "active" : ""}" data-analysis-page="${escapeHtml(page)}">${escapeHtml(label)}</button>
  `).join("")}</nav>`;
}

function analysisSubpageNav(page, activeSubpage, report = null) {
  const subpages = analysisSubpages(page);
  if (!subpages.length) {
    return "";
  }
  return `<nav class="analysis-subpage-tabs">${subpages.map(([subpage, label]) => `
    <button type="button" class="${subpage === activeSubpage ? "active" : ""}" data-analysis-subpage="${escapeHtml(subpage)}">${escapeHtml(label)}</button>
  `).join("")}</nav>`;
}

function analysisSubpages(page) {
  const subpages = {
    entries: [
      ["tags", aText("标签", "Tags")],
      ["forms", aText("词形结构", "Word Forms")],
      ["roots", aText("词根关系", "Roots")],
      ["coverage", aText("覆盖率", "Coverage")],
    ],
    ipa: [
      ["distribution", aText("分布", "Distribution")],
      ["units", aText("音位", "Units")],
      ["mismatches", aText("自动生成检查", "Auto Checks")],
    ],
    morphology: [
      ["tables", aText("表格使用", "Tables")],
      ["overrides", "Override"],
      ["generated", aText("生成检查", "Generated")],
    ],
    activity: [
      ["updated", aText("编辑日期", "Updated")],
      ["created", aText("新增日期", "Created")],
      ["latest", aText("最近修改", "Recent")],
    ],
  };
  return subpages[page] || [];
}

function renderQualityPage(report) {
  const subpage = activeQualitySubpage();
  return `
    ${qualitySubpageNav(subpage, report)}
    <section class="analysis-page-body">
      ${qualityPageBody(report, subpage)}
    </section>
  `;
}

function qualitySubpageNav(activeSubpage, report = null) {
  return `<div class="analysis-subpage-tab-groups quality-subpage-tab-groups">${qualitySubpageGroups().map((group) => `
    <div class="analysis-subpage-tab-group">
      <span>${escapeHtml(group.label)}</span>
      <nav class="analysis-subpage-tabs">${group.subpages.map(([subpage, label]) => `
        ${renderQualitySubpageButton(subpage, label, activeSubpage, report)}
      `).join("")}</nav>
    </div>
  `).join("")}</div>`;
}

function renderQualitySubpageButton(subpage, label, activeSubpage, report = null) {
  const count = report ? qualitySubpageEntryCount(report, subpage) : null;
  const isActive = subpage === activeSubpage;
  const disabled = count === 0 && !isActive;
  const countBadge = count === null ? "" : `<span class="analysis-tab-count">${escapeHtml(count)}</span>`;
  return `<button type="button" class="${isActive ? "active" : ""}" data-quality-subpage="${escapeHtml(subpage)}" ${disabled ? "disabled" : ""}>${escapeHtml(label)}${countBadge}</button>`;
}

function activeQualitySubpage() {
  const qualityViewState = activeQualityViewState();
  const subpages = qualitySubpageGroups().flatMap((group) => group.subpages);
  return subpages.some(([subpage]) => subpage === qualityViewState.subpage)
    ? qualityViewState.subpage
    : subpages[0]?.[0] || "issues";
}

function qualitySubpageGroups() {
  return [
    {
      label: aText("按优先度", "By priority"),
      subpages: [
        ["issues", aText("全部问题", "All Issues")],
        ["high", aText("高优先级", "High")],
        ["medium", aText("中优先级", "Medium")],
        ["low", aText("低优先级", "Low")],
      ],
    },
    {
      label: aText("按检查模块", "By check module"),
      subpages: [
        ["lemma", aText("词形问题", "Word Forms")],
        ["tags", aText("标签问题", "Tags")],
        ["ipa", "IPA"],
        ["network", aText("词源网络", "Etymology")],
        ["gloss", aText("Glossed 例句", "Glossed Examples")],
        ["other", aText("其他问题", "Other")],
      ],
    },
  ];
}

function analysisPageBody(report, page, subpage) {
  if (page === "entries") {
    return renderAnalysisEntriesPage(report, subpage);
  }
  if (page === "ipa") {
    return renderAnalysisIpaPage(report, subpage);
  }
  if (page === "morphology") {
    return renderAnalysisMorphologyPage(report, subpage);
  }
  if (page === "activity") {
    return renderAnalysisActivityPage(report, subpage);
  }
  return renderAnalysisOverview(report);
}

function renderAnalysisOverview(report) {
  return `
    <section class="analysis-grid analysis-summary-grid">
      ${analysisMetricCard(aText("词条", "Entries"), report.entries.length, `${report.rootCount} ${aText("个词根", "roots")}`, viewAction("editor"))}
      ${analysisMetricCard(aText("衍生词", "Derived"), report.derivedCount, `${report.isolatedRootCount} ${aText("个孤立词根", "isolated roots")}`, advancedFilterAction(aText("衍生词", "Derived entries"), report.derivedEntryIds))}
      ${analysisMetricCard(aText("释义覆盖", "Definition Coverage"), percentText(report.coverage.definitions), `${report.definitionCount} ${aText("条释义", "definitions")}`, advancedFilterAction(aText("有释义", "Has definitions"), report.definitionEntryIds, { variants: [{ title: aText("无释义", "No definitions"), entryIds: report.noDefinitionEntryIds }] }))}
      ${analysisMetricCard("IPA", percentText(report.coverage.ipa), `${report.ipa.syllableAverage} ${aText("平均音节", "avg syllables")}`, advancedFilterAction(aText("有 IPA", "Has IPA"), report.ipaEntryIds, { variants: [{ title: aText("无 IPA", "No IPA"), entryIds: report.noIpaEntryIds }] }))}
      ${analysisMetricCard(aText("形态学", "Morphology"), percentText(report.coverage.morphology), `${report.morphology.generatedForms} ${aText("个生成形式", "generated forms")}`, advancedFilterAction(aText("有形态表格", "Has morphology table"), report.morphologyEntryIds, { variants: [{ title: aText("无形态表格", "No morphology table"), entryIds: report.noMorphologyEntryIds }] }))}
    </section>
    <section class="analysis-grid">
      ${analysisCard(aText("词性分布", "Part of Speech"), analysisBarList(report.parts, { empty: aText("暂无词性标签", "No part-of-speech tags yet") }))}
      ${analysisCard(aText("覆盖率", "Coverage"), analysisCoverageList(report.coverageRows))}
      ${analysisCard(aText("编辑进度", "Editing Progress"), analysisActivityList({
        created: report.activity.created.slice(-10),
        updated: report.activity.updated.slice(-10),
        latest: report.activity.latest.slice(0, 6),
      }))}
    </section>
  `;
}

function renderAnalysisEntriesPage(report, subpage) {
  if (subpage === "forms") {
    return `<section class="analysis-detail-grid">
      ${analysisCard(aText("词长分布", "Word Lengths"), analysisBarList(report.allWordLengths, { empty: aText("暂无词形", "No lemmas yet") }))}
      ${analysisCard(aText("首字母分布", "Initial Letters"), analysisBarList(report.allInitialLetters, { empty: aText("暂无词形", "No lemmas yet") }))}
      ${analysisCard(aText("正写法字符", "Orthographic Characters"), analysisBarList(report.allCharacters, { empty: aText("暂无词形", "No lemmas yet") }))}
      ${analysisCard(aText("正写法双字符组合", "Orthographic Bigrams"), analysisBarList(report.allBigrams, { empty: aText("暂无组合", "No bigrams yet") }))}
    </section>`;
  }
  if (subpage === "roots") {
    return `<section class="analysis-detail-grid">${analysisCard(aText("词根家族排行", "Root Families"), analysisBarList(report.allRootFamilies, { empty: aText("暂无衍生关系", "No derivation links yet") }))}</section>`;
  }
  if (subpage === "coverage") {
    return `<section class="analysis-detail-grid">
      ${analysisCard(aText("覆盖率", "Coverage"), analysisCoverageList(report.coverageRows))}
      ${analysisCard(aText("规则与资料", "Rules and Data"), analysisFactList(analysisFactRows(report)))}
      ${analysisCard(aText("当前搜索命中字段", "Current Search Fields"), analysisBarList(report.searchFields, { empty: aText("暂无搜索", "No active search") }))}
    </section>`;
  }
  return `<section class="analysis-detail-grid">
    ${analysisCard(aText("词性分布", "Part of Speech"), analysisBarList(report.allParts, { empty: aText("暂无词性标签", "No part-of-speech tags yet") }))}
    ${analysisCard(aText("标签频率", "Tag Frequency"), analysisBarList(report.allTags, { empty: aText("暂无标签", "No tags yet") }))}
    ${analysisCard(aText("标签组合", "Tag Combinations"), analysisBarList(report.allTagCombos, { empty: aText("暂无组合", "No combinations yet") }))}
  </section>`;
}

function renderAnalysisIpaPage(report, subpage) {
  if (subpage === "units") {
    return `<section class="analysis-detail-grid">
      ${analysisCard(aText("IPA 音位频率", "IPA Unit Frequency"), analysisBarList(report.ipa.allUnits, { empty: aText("暂无 IPA", "No IPA yet") }))}
      ${analysisCard(aText("IPA 首音", "IPA Initials"), analysisBarList(report.ipa.allInitials, { empty: aText("暂无 IPA", "No IPA yet") }))}
      ${analysisCard(aText("IPA 尾音", "IPA Finals"), analysisBarList(report.ipa.allFinals, { empty: aText("暂无 IPA", "No IPA yet") }))}
    </section>`;
  }
  if (subpage === "mismatches") {
    return `<section class="analysis-detail-grid">${analysisCard(aText("自动生成检查", "Auto Checks"), analysisFactList(analysisIpaMismatchRows(report)))}</section>`;
  }
  return `<section class="analysis-detail-grid">
    ${analysisCard(aText("音节数分布", "Syllable Counts"), analysisBarList(report.ipa.allSyllableCounts, { empty: aText("暂无 IPA", "No IPA yet") }))}
    ${analysisCard(aText("IPA 覆盖", "IPA Coverage"), analysisCoverageList([["IPA", report.coverage.ipa, advancedFilterAction(aText("有 IPA", "Has IPA"), report.ipaEntryIds, { variants: [{ title: aText("无 IPA", "No IPA"), entryIds: report.noIpaEntryIds }] })]]))}
  </section>`;
}

function renderAnalysisMorphologyPage(report, subpage) {
  if (subpage === "overrides") {
    return `<section class="analysis-detail-grid">${analysisCard(aText("Override 排行", "Override Ranking"), analysisBarList(report.morphology.allOverrides, { empty: aText("暂无 override", "No overrides yet") }))}</section>`;
  }
  if (subpage === "generated") {
    return `<section class="analysis-detail-grid">${analysisCard(aText("生成检查", "Generated Checks"), analysisFactList([
      [aText("生成形式", "Generated forms"), report.morphology.generatedForms],
      [aText("形态空单元", "Empty morphology cells"), report.morphology.emptyCells, advancedFilterAction(aText("形态空单元", "Empty morphology cells"), report.morphology.emptyCellEntryIds)],
    ]))}</section>`;
  }
  return `<section class="analysis-detail-grid">
    ${analysisCard(aText("形态表格使用", "Morphology Tables"), analysisBarList(report.morphology.allTables, { empty: aText("暂无形态表格", "No morphology tables yet") }))}
    ${analysisCard(aText("形态学覆盖", "Morphology Coverage"), analysisCoverageList([[aText("形态表格", "Morphology table"), report.coverage.morphology, advancedFilterAction(aText("有形态表格", "Has morphology table"), report.morphologyEntryIds, { variants: [{ title: aText("无形态表格", "No morphology table"), entryIds: report.noMorphologyEntryIds }] })]]))}
  </section>`;
}

function renderAnalysisActivityPage(report, subpage) {
  if (subpage === "created") {
    return `<section class="analysis-detail-grid">${analysisCard(aText("新增日期", "Created Date"), analysisBarList(report.activity.created, { empty: aText("暂无创建记录", "No creation records") }))}</section>`;
  }
  if (subpage === "latest") {
    return `<section class="analysis-detail-grid">${analysisCard(aText("最近修改", "Recently Edited"), analysisLatestList(report.activity.latest))}</section>`;
  }
  return `<section class="analysis-detail-grid">${analysisCard(aText("编辑日期", "Updated Date"), analysisBarList(report.activity.updated, { empty: aText("暂无编辑记录", "No edit records") }))}</section>`;
}

function qualityPageBody(report, subpage) {
  const filterBar = renderQualityFilterBar(report, subpage);
  if (["lemma", "tags", "ipa", "other"].includes(subpage)) {
    const moduleIssues = qualityIssuesByModule(report, subpage);
    return `${filterBar}<section class="analysis-detail-grid">${analysisCard(qualityIssueModuleLabel(subpage), analysisIssueList(moduleIssues, { limit: Infinity }))}</section>`;
  }
  if (subpage === "network") {
    return `${filterBar}<section class="analysis-detail-grid">${analysisCard(aText("词源网络检查", "Etymology Network Checks"), analysisIssueList(report.networkIssues, { limit: Infinity }))}</section>`;
  }
  if (subpage === "gloss") {
    const glossIssues = qualityIssuesByModule(report, "gloss");
    return `${filterBar}<section class="analysis-detail-grid">${analysisCard(aText("Glossed 例句问题", "Glossed Example Issues"), analysisIssueList(glossIssues, { limit: Infinity }))}</section>`;
  }
  if (["high", "medium", "low"].includes(subpage)) {
    const issues = report.issues.filter((issue) => issue.severity === subpage);
    return `${filterBar}<section class="analysis-detail-grid">${analysisCard(aText("质量检查", "Quality Checks"), analysisIssueList(issues, { limit: Infinity }))}</section>`;
  }
  return `${filterBar}<section class="analysis-detail-grid">${analysisCard(aText("质量检查", "Quality Checks"), analysisIssueList(report.issues, { limit: Infinity }))}</section>`;
}

function renderQualityFilterBar(report, subpage) {
  const label = qualitySubpageLabel(subpage);
  const count = qualitySubpageEntryCount(report, subpage);
  const action = qualityFilterActionForSubpage(report, subpage);
  const attrs = analysisActionAttributes(action);
  return `
    <section class="analysis-quality-current" aria-label="${escapeHtml(aText("质量检查高级筛选", "Quality advanced filters"))}">
      <strong>${escapeHtml(t("qualityCurrentCategory"))}: ${escapeHtml(label)}</strong>
      <span>${escapeHtml(count)} ${escapeHtml(t("qualityEntryCount"))}</span>
      <button class="secondary-button analysis-quality-view-button" type="button"${attrs} ${attrs ? "" : "disabled"}>${escapeHtml(t("viewQualityEntries"))}</button>
      <button class="info-button" type="button" data-action="quality-filter-info" data-app-tooltip="always" aria-label="${escapeHtml(t("qualityFilterInfo"))}">i</button>
    </section>
  `;
}

function qualityIssuesWithEntries(issues = []) {
  return qualityModel.qualityIssuesWithEntries(issues);
}

function qualitySubpageKey(subpage) {
  const priorityMap = {
    issues: "all",
    high: "high",
    medium: "medium",
    low: "low",
  };
  if (priorityMap[subpage]) {
    return { group: "priority", key: priorityMap[subpage] };
  }
  const moduleKeys = new Set(["lemma", "tags", "ipa", "network", "gloss", "other"]);
  if (moduleKeys.has(subpage)) {
    return { group: "module", key: subpage };
  }
  return { group: "priority", key: "all" };
}

function qualitySubpageLabel(subpage) {
  const labels = Object.fromEntries(qualitySubpageGroups().flatMap((group) => group.subpages));
  return labels[subpage] || labels.issues || aText("全部问题", "All Issues");
}

function qualitySubpageEntryCount(report, subpage) {
  const action = qualityFilterActionForSubpage(report, subpage);
  return action?.entryIds?.length || 0;
}

function qualityFilterActionForSubpage(report, subpage) {
  const { group, key } = qualitySubpageKey(subpage);
  return qualityIssueFilterAction(report, group, key);
}

function qualityIssueFilterDefinitions(report, group) {
  const issueEntries = qualityIssuesWithEntries(report.issues);
  if (group === "module") {
    return ["lemma", "tags", "ipa", "network", "gloss", "other"].map((module) => ({
      key: module,
      title: qualityIssueModuleFilterTitle(module),
      issues: qualityIssuesWithEntries(qualityIssuesByModule(report, module)),
    }));
  }
  return [
    { key: "all", title: aText("质量问题", "Quality issues"), issues: issueEntries },
    { key: "high", title: aText("高优先级质量问题", "High-priority quality issues"), issues: issueEntries.filter((issue) => issue.severity === "high") },
    { key: "medium", title: aText("中优先级质量问题", "Medium-priority quality issues"), issues: issueEntries.filter((issue) => issue.severity === "medium") },
    { key: "low", title: aText("低优先级质量问题", "Low-priority quality issues"), issues: issueEntries.filter((issue) => issue.severity === "low") },
  ];
}

function qualityIssueFilterAction(report, group, activeKey, options = {}) {
  const definitions = qualityIssueFilterDefinitions(report, group);
  const active = definitions.find((item) => item.key === activeKey) || definitions[0];
  if (!active) {
    return null;
  }
  return qualityIssueAdvancedFilterAction(
    active.title,
    active.issues,
    definitions.filter((item) => item.key !== active.key),
    {
      key: active.key,
      meta: { type: "quality", group, activeKey: active.key },
      allowEmptyActive: Boolean(options.allowEmptyActive),
    },
  );
}

function refreshAdvancedFilterLocalization() {
  refreshAdvancedFilterState();
}

function qualityIssueAdvancedFilterAction(title, issues = [], variants = [], options = {}) {
  const activeIssues = qualityIssuesWithEntries(issues);
  const entryIds = entryIdsFrom(activeIssues.map((issue) => issue.entryId));
  return entryIds.length || options.allowEmptyActive
    ? advancedFilterAction(title, entryIds, {
      key: options.key || "",
      issues: activeIssues,
      variants: variants.map((variant) => {
        const variantIssues = qualityIssuesWithEntries(variant.issues);
        return {
          key: variant.key || "",
          title: variant.title,
          entryIds: entryIdsFrom(variantIssues.map((issue) => issue.entryId)),
          issues: variantIssues,
        };
      }),
      meta: options.meta || null,
      allowEmptyActive: Boolean(options.allowEmptyActive),
    })
    : null;
}

function qualityIssuesByModule(report, module) {
  return qualityModel.qualityIssuesByModule(report, module);
}

function qualityIssueEntryIdsByModule(report, module) {
  return qualityModel.qualityIssueEntryIdsByModule(report, module);
}

function qualityIssueModuleLabel(module) {
  const labels = {
    lemma: aText("词形问题", "Word-form issues"),
    tags: aText("标签问题", "Tag issues"),
    ipa: aText("IPA 问题", "IPA issues"),
    network: aText("词源网络问题", "Etymology network issues"),
    gloss: aText("Glossed 例句问题", "Glossed example issues"),
    other: aText("其他问题", "Other issues"),
  };
  return labels[module] || labels.other;
}

function qualityIssueSeverityLabel(severity) {
  const labels = {
    high: aText("高优先度", "High priority"),
    medium: aText("中优先度", "Medium priority"),
    low: aText("低优先度", "Low priority"),
  };
  return labels[severity] || labels.low;
}

function qualityIssueModuleFilterTitle(module) {
  return qualityIssueModuleLabel(module);
}

function analysisFactRows(report) {
  return [
    [aText("例句数量", "Examples"), report.examples, binaryCoverageFilterAction(aText("有例句", "Has examples"), report.exampleEntryIds, aText("无例句", "No examples"), report.noExampleEntryIds)],
    [aText("Glossed 例句", "Glossed examples"), report.glossExamples, advancedFilterAction(aText("Glossed 例句", "Glossed examples"), report.glossEntryIds)],
    [aText("多来源词条", "Multi-source entries"), report.multiSourceCount, advancedFilterAction(aText("多来源词条", "Multi-source entries"), report.multiSourceEntryIds)],
    [aText("当前搜索命中", "Current search matches"), report.searchMatches, viewAction("editor")],
  ];
}

function analysisIpaMismatchRows(report) {
  const matchTitle = aText("IPA 自动生成一致", "Auto IPA matches");
  const looseTitle = aText("IPA 自动生成不一致（宽松）", "Auto IPA mismatches (loose)");
  const strictTitle = aText("IPA 自动生成不一致（严格）", "Auto IPA mismatches (strict)");
  const variants = [
    { title: matchTitle, entryIds: report.ipa.generatedMatchEntryIds },
    { title: looseTitle, entryIds: report.ipa.generatedMismatchEntryIds },
    { title: strictTitle, entryIds: report.ipa.generatedMismatchStrictEntryIds },
  ];
  const ipaFilterAction = (title, entryIds) => entryIds.length
    ? advancedFilterAction(title, entryIds, { variants: variants.filter((variant) => variant.title !== title) })
    : null;
  return [
    [matchTitle, report.ipa.generatedMatch, ipaFilterAction(matchTitle, report.ipa.generatedMatchEntryIds)],
    [looseTitle, report.ipa.generatedMismatch, ipaFilterAction(looseTitle, report.ipa.generatedMismatchEntryIds)],
    [strictTitle, report.ipa.generatedMismatchStrict, ipaFilterAction(strictTitle, report.ipa.generatedMismatchStrictEntryIds)],
  ];
}

function buildQualityViewReport(dictionary) {
  return qualityModel.buildQualityReport(dictionary, {
    text: aText,
    normalizeText: normalize,
  });
}

function buildDictionaryAnalysis(dictionary) {
  return buildAnalysisReportForRoute(dictionary, "all", "");
}

function buildAnalysisReportForRoute(dictionary, page = "overview", subpage = "") {
  return analysisModel.buildReportForRoute(dictionary, { page, subpage }, {
    buildContext: buildAnalysisContext,
    builders: analysisSliceBuilders(),
    composeReport: composeLegacyAnalysisReport,
    maxCacheEntries: 24,
    sliceCacheKey: analysisSliceCacheKey,
  });
}

function buildAnalysisContext(dictionary) {
  const entries = dictionary.entries || [];
  return {
    dictionary,
    entries,
    total: entries.length || 1,
    query: dictionaryQueryModel.createDictionaryQueryContext(dictionary, {
      normalizeText: normalize,
      compareEntries,
      entryHasSources,
    }),
    cacheBaseKey: analysisBaseCacheKey(dictionary),
  };
}

function composeLegacyAnalysisReport(context, slices) {
  return {
    entries: context.entries,
    ...slices.relation,
    ...slices.rootFamilies,
    ...slices.coverage,
    ...slices.tags,
    ...slices.forms,
    ipa: slices.ipa,
    morphology: slices.morphology,
    ...slices.search,
    activity: slices.activity,
  };
}

function analysisSliceBuilders() {
  return {
    relation: buildAnalysisRelationSlice,
    rootFamilies: buildAnalysisRootFamiliesSlice,
    coverage: buildAnalysisCoverageSlice,
    tags: buildAnalysisTagSlice,
    forms: buildAnalysisFormSlice,
    ipa: buildAnalysisIpaSlice,
    morphology: buildAnalysisMorphologySlice,
    search: buildAnalysisSearchSlice,
    activity: buildAnalysisActivitySlice,
  };
}

function buildAnalysisRelationSlice(context) {
  return context.query.relationSummary();
}

function buildAnalysisRootFamiliesSlice(context) {
  const rootFamilyGroups = context.query.rootFamilies({
    limit: analysisRootFamilyLimit(),
    includeAll: true,
  });
  const familyRow = (group) => [group.lemma, group.derivedCount, directEntryAction(group.rootId)];
  return {
    rootFamilies: rootFamilyGroups.rows.map(familyRow),
    allRootFamilies: rootFamilyGroups.allRows.map(familyRow),
  };
}

function buildAnalysisCoverageSlice(context) {
  const { dictionary, entries, total } = context;
  const definitionEntryIds = new Set();
  const exampleEntryIds = new Set();
  const glossEntryIds = new Set();
  const noteEntryIds = new Set();
  const sourceEntryIds = new Set();
  const ipaEntryIds = new Set();
  const morphologyEntryIds = new Set();
  let definitionCount = 0;
  let examples = 0;
  let glossExamples = 0;

  entries.forEach((entry) => {
    const definitions = entry.definitions || [];
    const meaningfulDefinitions = definitions.filter((definition) => definition.meaning);
    definitionCount += meaningfulDefinitions.length;
    if (meaningfulDefinitions.length) {
      definitionEntryIds.add(entry.id);
    }
    if (definitions.some((definition) => definition.example)) {
      exampleEntryIds.add(entry.id);
    }
    examples += definitions.filter((definition) => definition.example).length;
    definitions.forEach((definition) => {
      const gloss = parseGloss(definition.example);
      if (gloss) {
        glossExamples += 1;
        glossEntryIds.add(entry.id);
      }
    });
    if (entry.notes) {
      noteEntryIds.add(entry.id);
    }
    if (entryHasSources(entry)) {
      sourceEntryIds.add(entry.id);
    }
    if (entry.pronunciation) {
      ipaEntryIds.add(entry.id);
    }
    if (resolveEntryMorphologyTable(entry, dictionary)) {
      morphologyEntryIds.add(entry.id);
    }
  });

  const noDefinitionEntryIds = entries
    .filter((entry) => !(entry.definitions || []).some((definition) => definition.meaning))
    .map((entry) => entry.id);
  const noExampleEntryIds = entries
    .filter((entry) => !(entry.definitions || []).some((definition) => definition.example))
    .map((entry) => entry.id);
  const noNoteEntryIds = entries
    .filter((entry) => !entry.notes)
    .map((entry) => entry.id);
  const noSourceEntryIds = entries
    .filter((entry) => !entryHasSources(entry))
    .map((entry) => entry.id);
  const noIpaEntryIds = entries
    .filter((entry) => !entry.pronunciation)
    .map((entry) => entry.id);
  const noMorphologyEntryIds = entries
    .filter((entry) => !resolveEntryMorphologyTable(entry, dictionary))
    .map((entry) => entry.id);
  const coverage = {
    definitions: definitionEntryIds.size / total,
    examples: exampleEntryIds.size / total,
    notes: noteEntryIds.size / total,
    sources: sourceEntryIds.size / total,
    ipa: ipaEntryIds.size / total,
    morphology: morphologyEntryIds.size / total,
  };
  const coverageRows = [
    [aText("有释义", "Definitions"), coverage.definitions, binaryCoverageFilterAction(aText("有释义", "Has definitions"), [...definitionEntryIds], aText("无释义", "No definitions"), noDefinitionEntryIds)],
    [aText("有例句", "Examples"), coverage.examples, binaryCoverageFilterAction(aText("有例句", "Has examples"), [...exampleEntryIds], aText("无例句", "No examples"), noExampleEntryIds)],
    [aText("有备注", "Notes"), coverage.notes, binaryCoverageFilterAction(aText("有备注", "Has notes"), [...noteEntryIds], aText("无备注", "No notes"), noNoteEntryIds)],
    [aText("有来源", "Sources"), coverage.sources, binaryCoverageFilterAction(aText("有来源", "Has sources"), [...sourceEntryIds], aText("无来源", "No sources"), noSourceEntryIds)],
    ["IPA", coverage.ipa, binaryCoverageFilterAction(aText("有 IPA", "Has IPA"), [...ipaEntryIds], aText("无 IPA", "No IPA"), noIpaEntryIds)],
    [aText("形态表格", "Morphology table"), coverage.morphology, binaryCoverageFilterAction(aText("有形态表格", "Has morphology table"), [...morphologyEntryIds], aText("无形态表格", "No morphology table"), noMorphologyEntryIds)],
  ];

  return {
    definitionCount,
    examples,
    glossExamples,
    definitionEntryIds: [...definitionEntryIds],
    exampleEntryIds: [...exampleEntryIds],
    glossEntryIds: [...glossEntryIds],
    noteEntryIds: [...noteEntryIds],
    sourceEntryIds: [...sourceEntryIds],
    ipaEntryIds: [...ipaEntryIds],
    morphologyEntryIds: [...morphologyEntryIds],
    noDefinitionEntryIds,
    noExampleEntryIds,
    noNoteEntryIds,
    noSourceEntryIds,
    noIpaEntryIds,
    noMorphologyEntryIds,
    coverage,
    coverageRows,
  };
}

function buildAnalysisTagSlice(context) {
  const { dictionary, entries } = context;
  const parts = new Map();
  const tags = new Map();
  const tagCombos = new Map();

  entries.forEach((entry) => {
    const entryPartTags = entryParts(entry, dictionary);
    if (entryPartTags.length) {
      entryPartTags.forEach((part) => incrementEntry(parts, part, entry));
    } else {
      incrementEntry(parts, NO_PART_FILTER_VALUE, entry);
    }
    (entry.tags || []).forEach((tag) => {
      incrementEntry(tags, tag, entry);
    });
    if ((entry.tags || []).length > 1) {
      incrementEntry(tagCombos, entry.tags.map((tag) => displayTag(tag, dictionary)).join(" + "), entry);
    }
  });

  return {
    parts: partEntryMapItems(parts, 12, dictionary),
    allParts: partEntryMapItems(parts, Number.MAX_SAFE_INTEGER, dictionary),
    tags: tagEntryMapItems(tags, 16, dictionary),
    allTags: tagEntryMapItems(tags, Number.MAX_SAFE_INTEGER, dictionary),
    tagCombos: topEntryMapItems(tagCombos, 10, aText("标签组合", "Tag Combination")),
    allTagCombos: topEntryMapItems(tagCombos, Number.MAX_SAFE_INTEGER, aText("标签组合", "Tag Combination")),
  };
}

function buildAnalysisFormSlice(context) {
  const { entries } = context;
  const initialLetters = new Map();
  const wordLengths = new Map();
  const characters = new Map();
  const bigrams = new Map();

  entries.forEach((entry) => {
    const lemma = String(entry.lemma || "");
    if (!lemma) {
      return;
    }
    incrementEntry(wordLengths, String(Array.from(lemma).length), entry);
    incrementEntry(initialLetters, Array.from(lemma.trim())[0] || "", entry);
    Array.from(lemma.replace(/\s+/g, "")).forEach((char) => incrementEntry(characters, char, entry));
    Array.from(lemma.replace(/\s+/g, "")).forEach((char, index, chars) => {
      if (index < chars.length - 1) {
        incrementEntry(bigrams, `${char}${chars[index + 1]}`, entry);
      }
    });
  });

  return {
    initialLetters: topEntryMapItems(initialLetters, 14, aText("首字母", "Initial Letter")),
    allInitialLetters: topEntryMapItems(initialLetters, Number.MAX_SAFE_INTEGER, aText("首字母", "Initial Letter")),
    wordLengths: numericEntryMapItems(wordLengths, aText("词长", "Word Length")),
    allWordLengths: numericEntryMapItems(wordLengths, aText("词长", "Word Length")),
    characters: topEntryMapItems(characters, 16, aText("正写法字符", "Orthographic Character")),
    allCharacters: topEntryMapItems(characters, Number.MAX_SAFE_INTEGER, aText("正写法字符", "Orthographic Character")),
    bigrams: topEntryMapItems(bigrams, 16, aText("正写法双字符组合", "Orthographic Bigram")),
    allBigrams: topEntryMapItems(bigrams, Number.MAX_SAFE_INTEGER, aText("正写法双字符组合", "Orthographic Bigram")),
  };
}

function buildAnalysisIpaSlice(context) {
  return analyzeIpa(context.entries, context.dictionary);
}

function buildAnalysisMorphologySlice(context) {
  return analyzeMorphology(context.entries, context.dictionary);
}

function buildAnalysisSearchSlice(context) {
  const { dictionary, entries } = context;
  const searchMatchEntries = normalizeEntrySearchText(searchQuery, dictionary)
    ? entries.filter((entry) => entryMatchesSearch(entry, dictionary))
    : entries;
  return {
    searchMatches: searchMatchEntries.length,
    searchMatchEntryIds: searchMatchEntries.map((entry) => entry.id),
    searchFields: analyzeSearchFields(entries, dictionary),
  };
}

function buildAnalysisActivitySlice(context) {
  return analyzeActivity(context.entries);
}

function analyzeIpa(entries, dictionary) {
  const units = new Map();
  const initials = new Map();
  const finals = new Map();
  const syllableCounts = new Map();
  let syllableTotal = 0;
  let syllableEntries = 0;
  let generatedMatch = 0;
  let generatedMismatch = 0;
  let generatedMismatchStrict = 0;
  const generatedMatchEntryIds = new Set();
  const generatedMismatchEntryIds = new Set();
  const generatedMismatchStrictEntryIds = new Set();
  const complex = normalizeIpaSettings(dictionary.settings?.ipa).syllable.complexPhonemes;
  entries.forEach((entry) => {
    if (!entry.pronunciation) {
      return;
    }
    const clean = cleanIpaText(entry.pronunciation);
    const tokens = tokenizePhonemeUnits(clean.replace(/[.\s]/g, ""), complex).map((token) => token.value).filter(Boolean);
    tokens.forEach((token) => incrementEntry(units, token, entry));
    if (tokens[0]) {
      incrementEntry(initials, tokens[0], entry);
    }
    if (tokens[tokens.length - 1]) {
      incrementEntry(finals, tokens[tokens.length - 1], entry);
    }
    const syllables = clean.split(/[.\s]+/).filter(Boolean);
    if (syllables.length) {
      syllableEntries += 1;
      syllableTotal += syllables.length;
      incrementEntry(syllableCounts, String(syllables.length), entry);
    }
    const generated = generateIpaFromLemma(entry.lemma, dictionary.settings?.ipa);
    if (generated && generated === String(entry.pronunciation ?? "")) {
      generatedMatch += 1;
      generatedMatchEntryIds.add(entry.id);
    }
    if (generated && normalizeIpaCompare(generated) !== normalizeIpaCompare(entry.pronunciation)) {
      generatedMismatch += 1;
      generatedMismatchEntryIds.add(entry.id);
    }
    if (generated && generated !== String(entry.pronunciation ?? "")) {
      generatedMismatchStrict += 1;
      generatedMismatchStrictEntryIds.add(entry.id);
    }
  });
  return {
    units: topEntryMapItems(units, 16, aText("IPA 音位", "IPA Unit")),
    allUnits: topEntryMapItems(units, Number.MAX_SAFE_INTEGER, aText("IPA 音位", "IPA Unit")),
    initials: topEntryMapItems(initials, 12, aText("IPA 首音", "IPA Initial")),
    allInitials: topEntryMapItems(initials, Number.MAX_SAFE_INTEGER, aText("IPA 首音", "IPA Initial")),
    finals: topEntryMapItems(finals, 12, aText("IPA 尾音", "IPA Final")),
    allFinals: topEntryMapItems(finals, Number.MAX_SAFE_INTEGER, aText("IPA 尾音", "IPA Final")),
    syllableCounts: numericEntryMapItems(syllableCounts, aText("音节数", "Syllable Count")),
    allSyllableCounts: numericEntryMapItems(syllableCounts, aText("音节数", "Syllable Count")),
    syllableAverage: syllableEntries ? (syllableTotal / syllableEntries).toFixed(2) : "0",
    generatedMatch,
    generatedMatchEntryIds: [...generatedMatchEntryIds],
    generatedMismatch,
    generatedMismatchEntryIds: [...generatedMismatchEntryIds],
    generatedMismatchStrict,
    generatedMismatchStrictEntryIds: [...generatedMismatchStrictEntryIds],
  };
}

function analyzeMorphology(entries, dictionary) {
  const tableUse = new Map();
  const overrideRows = [];
  let generatedForms = 0;
  let emptyCells = 0;
  const emptyCellEntryIds = new Set();
  entries.forEach((entry) => {
    const table = resolveEntryMorphologyTable(entry, dictionary);
    if (!table) {
      incrementEntry(tableUse, aText("无表格", "No table"), entry);
      return;
    }
    incrementEntry(tableUse, table.name || aText("未命名表格", "Untitled table"), entry);
    const overrides = Object.keys(entry.morphology?.overrides || {});
    if (overrides.length) {
      overrideRows.push([entry.lemma || aText("无词形", "No lemma"), overrides.length, directEntryAction(entry.id)]);
    }
    for (let row = 0; row < table.rows; row += 1) {
      for (let col = 0; col < table.cols; col += 1) {
        let value = "";
        try {
          value = morphologyCellValue(entry, table, row, col, dictionary);
        } catch {
          value = "";
        }
        if (value) {
          generatedForms += 1;
        } else {
          emptyCells += 1;
          emptyCellEntryIds.add(entry.id);
        }
      }
    }
  });
  return {
    tables: topEntryMapItems(tableUse, 12, aText("形态表格", "Morphology Table")),
    allTables: topEntryMapItems(tableUse, Number.MAX_SAFE_INTEGER, aText("形态表格", "Morphology Table")),
    overrides: overrideRows
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "zh-CN"))
      .slice(0, 12),
    allOverrides: overrideRows
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "zh-CN")),
    generatedForms,
    emptyCells,
    emptyCellEntryIds: [...emptyCellEntryIds],
  };
}

function analyzeActivity(entries) {
  const created = new Map();
  const updated = new Map();
  entries.forEach((entry) => {
    const createdDay = dateBucket(entry.createdAt);
    const updatedDay = dateBucket(entry.updatedAt);
    if (createdDay) {
      incrementEntry(created, createdDay, entry);
    }
    if (updatedDay) {
      incrementEntry(updated, updatedDay, entry);
    }
  });
  return {
    created: numericDateEntryItems(created, aText("新增日期", "Created Date")),
    updated: numericDateEntryItems(updated, aText("编辑日期", "Updated Date")),
    latest: [...entries]
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
      .map((entry) => [entry.lemma || aText("无词形", "No lemma"), dateBucket(entry.updatedAt) || "", directEntryAction(entry.id)]),
  };
}

function analyzeSearchFields(entries, dictionary) {
  const searchOptions = entrySearchQueryOptions(dictionary);
  const query = searchQuery;
  if (!searchOptions.normalizeText(query)) {
    return [];
  }
  const { fields: searchFields, fuzzyFields } = searchOptions;
  const counts = new Map();
  entries.forEach((entry) => {
    const fieldValues = entrySearchModel.entrySearchFieldValues(entry, dictionary, {
      fields: searchFields,
      normalizeText: searchOptions.normalizeText,
    });
    const fieldGroups = [
      ["lemma", aText("词形", "Lemma"), fieldValues.lemma],
      ["tags", aText("标签", "Tags"), fieldValues.tags],
      ["definitions", aText("释义", "Definitions"), fieldValues.definitions],
      ["examples", aText("例句", "Examples"), fieldValues.examples],
      ["etymology", aText("词源", "Etymology"), fieldValues.etymology],
      ["pronunciation", "IPA", fieldValues.pronunciation],
      ["morphology", aText("形态形式", "Morphology forms"), fieldValues.morphology],
      ["notes", aText("备注", "Notes"), fieldValues.notes],
    ];
    fieldGroups.forEach(([field, label, values]) => {
      if (values.some((value) => textMatches(value, query, fuzzyFields.has(field)))) {
        incrementEntry(counts, label, entry);
      }
    });
  });
  return topEntryMapItems(counts, 10, aText("搜索字段", "Search Field"));
}

function analysisMetricCard(label, value, note = "", action = null) {
  const attrs = analysisActionAttributes(action);
  return `<article class="analysis-metric"${attrs}><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
}

function analysisCard(title, body) {
  return `<article class="analysis-card"><h3>${escapeHtml(title)}</h3>${body}</article>`;
}

function analysisBarList(items, options = {}) {
  if (!items.length) {
    return `<p class="muted-text">${escapeHtml(options.empty || aText("暂无数据", "No data"))}</p>`;
  }
  const max = Math.max(...items.map((item) => item[1]), 1);
  return `<div class="analysis-bars">${items.map(([label, value, action]) => {
    const attrs = analysisActionAttributes(action);
    const labelTag = attrs ? "button" : "span";
    const labelAttrs = attrs ? ` type="button"` : "";
    return `
    <div class="analysis-bar-row"${attrs}>
      <${labelTag} class="analysis-bar-label"${labelAttrs}>${escapeHtml(label)}</${labelTag}>
      <div class="analysis-bar-track"><span style="width: ${Math.max(4, (value / max) * 100).toFixed(2)}%"></span></div>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
  }).join("")}</div>`;
}

function analysisCoverageList(rows) {
  return `<div class="analysis-bars">${rows.map(([label, ratio, action]) => {
    const attrs = analysisActionAttributes(action);
    const labelTag = attrs ? "button" : "span";
    const labelAttrs = attrs ? ` type="button"` : "";
    return `
    <div class="analysis-bar-row"${attrs}>
      <${labelTag} class="analysis-bar-label"${labelAttrs}>${escapeHtml(label)}</${labelTag}>
      <div class="analysis-bar-track"><span style="width: ${(ratio * 100).toFixed(2)}%"></span></div>
      <strong>${percentText(ratio)}</strong>
    </div>
  `;
  }).join("")}</div>`;
}

function analysisActivityList(activity) {
  const created = analysisBarList(activity.created, { empty: aText("暂无创建记录", "No creation records") });
  const updated = analysisBarList(activity.updated, { empty: aText("暂无编辑记录", "No edit records") });
  const latest = activity.latest.length
    ? `<ul class="analysis-issue-list">${activity.latest.map(([lemma, date, action]) => `<li${analysisActionAttributes(action)}><button type="button">${escapeHtml(lemma)}</button><span>${escapeHtml(date)}</span></li>`).join("")}</ul>`
    : `<p class="muted-text">${escapeHtml(aText("暂无最近活动", "No recent activity"))}</p>`;
  return `<h4>${escapeHtml(aText("新增", "Created"))}</h4>${created}<h4>${escapeHtml(aText("编辑", "Updated"))}</h4>${updated}<h4>${escapeHtml(aText("最近修改", "Recently Edited"))}</h4>${latest}`;
}

function analysisLatestList(items) {
  if (!items.length) {
    return `<p class="muted-text">${escapeHtml(aText("暂无最近活动", "No recent activity"))}</p>`;
  }
  return `<ul class="analysis-issue-list">${items.map(([lemma, date, action]) => `<li${analysisActionAttributes(action)}><button type="button">${escapeHtml(lemma)}</button><span>${escapeHtml(date)}</span></li>`).join("")}</ul>`;
}

function analysisFactList(rows) {
  return `<dl class="analysis-fact-list">${rows.map(([label, value, action]) => `
    <div${analysisActionAttributes(action)}>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `).join("")}</dl>`;
}

function analysisIssueList(issues, options = {}) {
  if (!issues.length) {
    return `<p class="muted-text">${escapeHtml(aText("未发现问题", "No issues found"))}</p>`;
  }
  const limit = options.limit === Infinity ? issues.length : (Number.isFinite(options.limit) ? options.limit : 80);
  return `<ul class="analysis-issue-list">${issues.slice(0, limit).map((issue) => `
    <li class="analysis-issue ${escapeHtml(issue.severity || "low")}"${issue.entryId ? ` data-entry-id="${escapeHtml(issue.entryId)}"` : ""}>
      <span>${escapeHtml(issue.severity || "")}</span>
      <div>
        ${issue.entryId ? `<button type="button" data-entry-id="${escapeHtml(issue.entryId)}">${escapeHtml(issue.entryLemma || aText("无词形", "No lemma"))}</button>` : ""}
        <strong>${escapeHtml(issue.title)}</strong>
        ${issue.detail ? `<small>${escapeHtml(issue.detail)}</small>` : ""}
      </div>
    </li>
  `).join("")}</ul>`;
}

function cleanIpaText(value) {
  return ipaModel.cleanIpaText(value);
}

function normalizeIpaCompare(value) {
  return ipaModel.normalizeIpaCompare(value);
}

function dateBucket(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime()) || date.getTime() <= 0) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function percentText(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function aText(zh, en) {
  return currentLanguage === "zh" ? zh : en;
}

function entryIdsFrom(items) {
  return [...new Set((items || [])
    .map((item) => typeof item === "string" ? item : item?.id)
    .filter(Boolean))];
}

function analysisFilterTitle(label, value = "") {
  return value ? `${label}: ${value}` : label;
}

function binaryCoverageFilterAction(activeTitle, activeEntryIds, alternateTitle, alternateEntryIds) {
  const activeIds = entryIdsFrom(activeEntryIds);
  const alternateIds = entryIdsFrom(alternateEntryIds);
  return activeIds.length
    ? advancedFilterAction(activeTitle, activeIds, { variants: [{ title: alternateTitle, entryIds: alternateIds }] })
    : null;
}

function advancedFilterAction(title, items, options = {}) {
  const entryIds = entryIdsFrom(items);
  const variants = [
    { key: options.key || "", title, entryIds, issues: options.issues || [] },
    ...(options.variants || []).map((variant) => ({
      key: variant.key || "",
      title: variant.title,
      entryIds: entryIdsFrom(variant.entryIds),
      issues: variant.issues || [],
    })),
  ].filter((variant, index) => variant.entryIds.length || (index === 0 && options.allowEmptyActive));
  return {
    type: "advanced-filter",
    title,
    entryIds,
    variants,
    meta: options.meta || null,
  };
}

function directEntryAction(entryId) {
  return entryId ? { type: "entry", entryId } : null;
}

function viewAction(view = "editor") {
  return { type: "view", view };
}

function normalizeAnalysisAction(action) {
  if (!action) {
    return null;
  }
  if (typeof action === "string") {
    return directEntryAction(action);
  }
  return action;
}

function analysisActionAttributes(action) {
  const normalized = normalizeAnalysisAction(action);
  if (!normalized) {
    return "";
  }
  if (normalized.type === "entry" && normalized.entryId) {
    return ` data-entry-id="${escapeHtml(normalized.entryId)}"`;
  }
  if (normalized.type === "view" && normalized.view) {
    return ` data-view-target="${escapeHtml(normalized.view)}"`;
  }
  if (normalized.type === "part-filter") {
    return ` data-part-filter-value="${escapeHtml(normalized.part || NO_PART_FILTER_VALUE)}"`;
  }
  if (normalized.type === "advanced-filter" && (normalized.entryIds?.length || normalized.variants?.length)) {
    const id = `filter-${analysisFilterCounter += 1}`;
    analysisFilterRegistry.set(id, normalized);
    return ` data-advanced-filter-id="${escapeHtml(id)}"`;
  }
  return "";
}

function increment(map, key, amount = 1) {
  const label = String(key || aText("未命名", "Untitled"));
  map.set(label, (map.get(label) || 0) + amount);
}

function incrementEntry(map, key, entry, amount = 1) {
  const label = String(key || aText("未命名", "Untitled"));
  if (!map.has(label)) {
    map.set(label, { count: 0, entryIds: new Set() });
  }
  const item = map.get(label);
  item.count += amount;
  if (entry?.id) {
    item.entryIds.add(entry.id);
  }
}

function mapPush(map, key, value) {
  if (!map.has(key)) {
    map.set(key, []);
  }
  map.get(key).push(value);
}

function topMapItems(map, limit = 12) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "zh-CN"))
    .slice(0, limit);
}

function topEntryMapItems(map, limit = 12, title = "") {
  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count || String(a[0]).localeCompare(String(b[0]), "zh-CN"))
    .slice(0, limit)
    .map(([label, item]) => [label, item.count, advancedFilterAction(analysisFilterTitle(title, label), [...item.entryIds])]);
}

function partEntryMapItems(map, limit = 12, dictionary = activeDictionary()) {
  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count || String(partDisplayLabel(a[0], dictionary)).localeCompare(String(partDisplayLabel(b[0], dictionary)), "zh-CN"))
    .slice(0, limit)
    .map(([part, item]) => [partDisplayLabel(part, dictionary), item.count, partFilterAction(part)]);
}

function tagEntryMapItems(map, limit = 12, dictionary = activeDictionary()) {
  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count || String(displayTag(a[0], dictionary)).localeCompare(String(displayTag(b[0], dictionary)), "zh-CN"))
    .slice(0, limit)
    .map(([tag, item]) => [
      displayTag(tag, dictionary),
      item.count,
      tagIsPartFilterCandidate(tag, dictionary) ? partFilterAction(tag) : tagAdvancedFilterAction(tag),
    ]);
}

function partDisplayLabel(part, dictionary = activeDictionary()) {
  return part === NO_PART_FILTER_VALUE ? t("noPart") : displayTag(part, dictionary);
}

function tagIsPartFilterCandidate(tag, dictionary = activeDictionary()) {
  const structuralTag = searchNormalizationModel.normalizeStructuralKey(tag);
  return Boolean(structuralTag)
    && (dictionary?.entries || []).some((entry) => entryParts(entry, dictionary)
      .some((part) => searchNormalizationModel.normalizeStructuralKey(part) === structuralTag));
}

function numericMapItems(map) {
  return [...map.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
}

function numericEntryMapItems(map, title = "") {
  return [...map.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([label, item]) => [label, item.count, advancedFilterAction(analysisFilterTitle(title, label), [...item.entryIds])]);
}

function numericDateItems(map) {
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function numericDateEntryItems(map, title = "") {
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, item]) => [label, item.count, advancedFilterAction(analysisFilterTitle(title, label), [...item.entryIds])]);
}

function renderMorphologyDisplay(entry, showEmptySections = false) {
  const dictionary = activeDictionary();
  const resolvedGroups = morphologyModel
    .resolveEntryMorphologyGroups(entry, dictionary, { normalizeText: searchNormalizationModel.normalizeStructuralKey })
    .filter(({ templateGroup }) => templateGroup.tables.length);
  elements.displayMorphologySection.hidden = !resolvedGroups.length && !showEmptySections;
  elements.displayMorphology.innerHTML = "";
  if (!resolvedGroups.length) {
    return;
  }
  const groups = document.createElement("div");
  groups.className = "morphology-display-groups";
  resolvedGroups.forEach(({ templateGroup, entryGroup }) => {
    const group = document.createElement("section");
    group.className = "morphology-display-group";
    const groupTitle = entryGroup?.title || templateGroup.name || t("morphologyGroup");
    const groupNotes = String(entryGroup?.notes || "").trim();
    const tableCards = templateGroup.tables.map((table) => {
      const rows = [];
      rows.push(`<tr><th scope="col" aria-label="${escapeHtml(t("rowLabels"))}"></th>${table.columnLabels.map((label) => `<th scope="col">${escapeHtml(label)}</th>`).join("")}</tr>`);
      for (let row = 0; row < table.rowCount; row += 1) {
        rows.push(`<tr><th>${escapeHtml(table.rowLabels[row])}</th>${Array.from({ length: table.columnCount }, (_, col) => {
          const value = morphologyModel.morphologyCellValue(entry, entryGroup, table, row, col, dictionary);
          return `<td>${escapeHtml(value)}</td>`;
        }).join("")}</tr>`);
      }
      return `
        <section class="morphology-display-table">
          <h5>${escapeHtml(table.title || groupTitle)}</h5>
          <div class="morphology-table-scroll"><table class="morphology-table">${rows.join("")}</table></div>
        </section>
      `;
    }).join("");
    group.innerHTML = `
      <div class="morphology-display-group-heading">
        <h4>${escapeHtml(groupTitle)}</h4>
        ${groupNotes ? `<p class="morphology-display-group-note">${escapeHtml(groupNotes)}</p>` : ""}
      </div>
      <div class="morphology-display-table-grid">${tableCards}</div>
    `;
    groups.append(group);
  });
  elements.displayMorphology.append(groups);
}

function renderDictionaryManager() {
  elements.dictionaryManagerList.innerHTML = "";

  if (!state.dictionaries.length) {
    elements.dictionaryManagerList.append(emptyState(t("noDictionary"), t("emptyDictionaryBody")));
    return;
  }

  state.dictionaries.forEach((dictionary) => {
    const card = document.createElement("article");
    const isActive = dictionary.id === state.activeDictionaryId;
    const isSelected = dictionary.id === state.selectedDictionaryConfigId;
    card.className = `dictionary-manager-card${isSelected ? " selected" : ""}`;
    card.innerHTML = `
      <div>
        <strong>${escapeHtml(dictionary.name)}</strong>
        <small>${escapeHtml(dictionaryStatsText(dictionary))}</small>
      </div>
      <p>${escapeHtml(dictionary.description || t("noDescription"))}</p>
      <div class="card-actions">
        <button class="secondary-button" type="button" data-action="config">${escapeHtml(t("config"))}</button>
        <button class="secondary-button" type="button" data-action="export">${escapeHtml(t("exportJson"))}</button>
        ${isActive
          ? `<button class="primary-button current-dictionary-button" type="button" aria-current="true" disabled>${escapeHtml(t("current"))}</button>`
          : `<button class="secondary-button" type="button" data-action="activate">${escapeHtml(t("setCurrent"))}</button>`}
      </div>
    `;
    card.querySelector('[data-action="config"]').addEventListener("click", async () => {
      if (dictionary.id !== state.selectedDictionaryConfigId && !(await confirmLeaveUnsavedDictionaryForm())) {
        return;
      }
      state.selectedDictionaryConfigId = dictionary.id;
      fillDictionaryForm(dictionary);
      renderDictionaryManager();
    });
    card.querySelector('[data-action="activate"]')?.addEventListener("click", async () => {
      if (!(await confirmLeaveUnsavedDictionaryForm())) {
        return;
      }
      await activateDictionary(dictionary.id);
    });
    card.querySelector('[data-action="export"]').addEventListener("click", () => exportDictionary(dictionary.id));
    elements.dictionaryManagerList.append(card);
  });
}

function fillEntryForm(entry) {
  const isEditing = Boolean(entry?.id);
  const blankEntry = {
    id: "",
    lemma: "",
    pronunciation: "",
    tags: [],
    definitions: [],
    etymology: { sources: [], description: "" },
    morphologyMode: "auto",
    morphologyGroups: [],
    notes: "",
  };
  const formEntry = entry || blankEntry;

  elements.entryMode.textContent = isEditing ? t("edit") : t("new");
  elements.entryFormTitle.textContent = isEditing ? formEntry.lemma : t("entry");
  elements.deleteEntryButton.hidden = !isEditing;
  elements.entryId.value = formEntry.id || "";
  elements.lemmaInput.value = formEntry.lemma || "";
  elements.pronunciationInput.value = formEntry.pronunciation || "";
  elements.tagsInput.value = (formEntry.tags || []).join("，");
  elements.notesInput.value = formEntry.notes || "";
  elements.sourceEntryInput.value = (formEntry.etymology?.sources || []).join("，");
  elements.etymologyDescriptionInput.value = formEntry.etymology?.description || "";
  renderDefinitionFormList(formEntry.definitions);
  renderEntryMorphologyControls(formEntry);
  renderFullEditDerivedEntries(formEntry);
  applyFullEntrySectionOrder();
  renderIpaKeyboard(activeDictionary());
}

function applyFullEntrySectionOrder() {
  const sections = Object.fromEntries(
    [...elements.entryForm.querySelectorAll("[data-entry-form-section]")]
      .map((section) => [section.dataset.entryFormSection, section]),
  );
  const actions = elements.entryForm.querySelector(".form-actions");
  if (!actions) {
    return;
  }
  normalizeEntrySectionOrder(activeDictionary()?.settings?.entrySectionOrder)
    .forEach((section) => actions.before(sections[section]));
}

function renderEntryMorphologyControls(entry) {
  renderMorphologyEntryControls(elements.entryMorphologyControls, entry, { full: true });
}

function morphologyFormPreviewEntry(entry = {}, full = false) {
  return {
    ...entry,
    lemma: full ? elements.lemmaInput.value.trim() : entry.lemma || "",
    tags: full ? splitList(elements.tagsInput.value) : entry.tags || [],
  };
}

function morphologyEditorResolvedGroups(entry, dictionary) {
  return morphologyModel.resolveEntryMorphologyGroups(entry, dictionary, { normalizeText: searchNormalizationModel.normalizeStructuralKey })
    .filter(({ templateGroup }) => templateGroup.tables.length);
}

function renderMorphologyEntryControls(host, entry = {}, { full = false } = {}) {
  if (!host) {
    return;
  }
  const dictionary = activeDictionary();
  const previewEntry = morphologyFormPreviewEntry(entry, full);
  const state = morphologyModel.normalizeEntryMorphologyState(entry, { reserveEntityId, usedIds: new Set() });
  const resolved = morphologyEditorResolvedGroups({ ...previewEntry, ...state }, dictionary);
  const manualGroups = state.morphologyGroups.map((entryGroup) => ({
    templateGroup: normalizeMorphology(dictionary?.morphology).templateGroups.find((group) => group.id === entryGroup.templateGroupId),
    entryGroup,
  })).filter(({ templateGroup }) => templateGroup);
  const groups = state.morphologyMode === "manual" ? manualGroups : resolved;
  const availableGroups = normalizeMorphology(dictionary?.morphology).templateGroups;
  host.innerHTML = `
    <div class="entry-morphology-mode-row" data-morphology-mode="${escapeHtml(state.morphologyMode)}">
      <strong>${escapeHtml(state.morphologyMode === "auto" ? t("morphologyAuto") : t("morphologyManual"))}</strong>
      <button class="secondary-button" type="button" data-action="toggle-entry-morphology-mode">${escapeHtml(state.morphologyMode === "auto" ? t("switchToManualMorphology") : t("restoreAutoMorphology"))}</button>
    </div>
    ${state.morphologyMode === "manual" ? `
      <div class="entry-morphology-add-row">
        <select data-field="addMorphologyGroup">${availableGroups.map((group) => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.name)}</option>`).join("")}</select>
        <button class="primary-button" type="button" data-action="add-entry-morphology-group">${escapeHtml(t("addEntryMorphologyGroup"))}</button>
      </div>` : ""}
    <p class="field-help">${escapeHtml(t("morphologyOverrideHelp"))}</p>
    <div class="entry-morphology-group-list">${groups.map(({ templateGroup, entryGroup }, index) => renderEntryMorphologyGroupEditor(templateGroup, entryGroup, previewEntry, state.morphologyMode, index, groups.length)).join("")}</div>
  `;
}

function renderEntryMorphologyGroupEditor(templateGroup, entryGroup, entry, mode, index = 0, total = 1) {
  const group = entryGroup || { templateGroupId: templateGroup.id, title: "", notes: "", overrides: {} };
  const tables = templateGroup.tables.map((table) => renderEntryMorphologyOverrideTable(table, group, entry)).join("");
  return `
    <section class="entry-morphology-group-card" data-template-group-id="${escapeHtml(templateGroup.id)}">
      <div class="entry-morphology-group-heading">
        <div>
          <strong>${escapeHtml(templateGroup.name)}</strong>
          <span class="field-help">${escapeHtml(mode === "auto" ? t("morphologyAuto") : t("morphologyManual"))}</span>
        </div>
        ${mode === "manual" ? `<div class="panel-actions"><button class="secondary-button" type="button" data-action="move-entry-morphology-group-up" ${index === 0 ? "disabled" : ""}>${escapeHtml(t("moveUp"))}</button><button class="secondary-button" type="button" data-action="move-entry-morphology-group-down" ${index === total - 1 ? "disabled" : ""}>${escapeHtml(t("moveDown"))}</button><button class="danger-ghost" type="button" data-action="remove-entry-morphology-group">${escapeHtml(t("removeEntryMorphologyGroup"))}</button></div>` : ""}
      </div>
      <div class="entry-morphology-group-fields">
        <label><span>${escapeHtml(t("entryMorphologyGroupTitle"))}</span><input data-field="entryMorphologyTitle" value="${escapeHtml(group.title || "")}" placeholder="${escapeHtml(t("useTemplateGroupTitle"))}"></label>
        <label><span>${escapeHtml(t("entryMorphologyGroupNotes"))}</span><textarea data-field="entryMorphologyNotes" rows="2">${escapeHtml(group.notes || "")}</textarea></label>
      </div>
      ${tables}
    </section>
  `;
}

function renderEntryMorphologyOverrideTable(table, entryGroup, entry) {
  const rows = [`<tr><th></th>${table.columnLabels.map((label) => `<th>${escapeHtml(label)}</th>`).join("")}</tr>`];
  for (let row = 0; row < table.rowCount; row += 1) {
    rows.push(`<tr><th>${escapeHtml(table.rowLabels[row])}</th>${Array.from({ length: table.columnCount }, (_, column) => {
      const key = morphologyCellKey(row, column);
      const value = entryGroup.overrides?.[table.id]?.[key] || "";
      const placeholder = morphologyModel.morphologyCellDefaultValue(entry, table, row, column, activeDictionary());
      return `<td><input class="morphology-override-input" data-morphology-table-id="${escapeHtml(table.id)}" data-morphology-override="${escapeHtml(key)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"></td>`;
    }).join("")}</tr>`);
  }
  return `<section class="entry-morphology-override-table"><h5>${escapeHtml(table.title)}</h5><div class="morphology-table-scroll"><table class="morphology-table">${rows.join("")}</table></div></section>`;
}

function collectMorphologyEntryState(host, entry = {}) {
  const morphologyMode = host?.querySelector("[data-morphology-mode]")?.dataset.morphologyMode || "auto";
  const visibleGroups = [...(host?.querySelectorAll(".entry-morphology-group-card") || [])].map((card) => {
    const overrides = {};
    card.querySelectorAll("[data-morphology-override]").forEach((input) => {
      const tableId = input.dataset.morphologyTableId;
      const value = input.value.trim();
      if (!tableId || !value) {
        return;
      }
      if (!overrides[tableId]) {
        overrides[tableId] = {};
      }
      overrides[tableId][input.dataset.morphologyOverride] = value;
    });
    return {
      templateGroupId: card.dataset.templateGroupId,
      title: card.querySelector('[data-field="entryMorphologyTitle"]')?.value.trim() || "",
      notes: card.querySelector('[data-field="entryMorphologyNotes"]')?.value.trim() || "",
      overrides,
    };
  });
  const previous = entry.morphologyGroups || [];
  const morphologyGroups = morphologyMode === "auto"
    ? [...previous.filter((group) => !visibleGroups.some((visible) => visible.templateGroupId === group.templateGroupId)), ...visibleGroups]
    : visibleGroups;
  return morphologyModel.normalizeEntryMorphologyState({ morphologyMode, morphologyGroups });
}

async function toggleMorphologyEditorMode(host, entry = {}, { full = false } = {}) {
  const current = collectMorphologyEntryState(host, entry);
  const previewEntry = morphologyFormPreviewEntry({ ...entry, ...current }, full);
  if (current.morphologyMode === "auto") {
    const confirmed = await appConfirm(t("switchToManualMorphologyConfirm"));
    if (!confirmed) {
      return;
    }
    const morphologyGroups = morphologyModel.materializeAutomaticMorphologyGroups(
      previewEntry,
      activeDictionary(),
      {
        normalizeText: searchNormalizationModel.normalizeStructuralKey,
      },
    );
    renderMorphologyEntryControls(host, {
      ...previewEntry,
      morphologyMode: "manual",
      morphologyGroups,
    }, { full });
    return;
  }
  const confirmed = await appConfirm(t("restoreAutoMorphologyConfirm"), { danger: true });
  if (!confirmed) {
    return;
  }
  renderMorphologyEntryControls(host, {
    ...previewEntry,
    morphologyMode: "auto",
    morphologyGroups: [],
  }, { full });
}

function renderPartialMorphologyControls(entry) {
  const body = partialEditBody();
  renderMorphologyEntryControls(body?.querySelector(".partial-morphology-controls"), entry);
}

function definitionFormStateFromCard(card) {
  return {
    id: card.dataset.definitionId || uid("def"),
    meaning: card.querySelector('[data-field="meaning"]')?.value.trim() || "",
    example: card.querySelector('[data-field="example"]')?.value.trim() || "",
    note: card.querySelector('[data-field="note"]')?.value.trim() || "",
    showExample: Boolean(card.querySelector('[data-field="example"]')),
    showNote: Boolean(card.querySelector('[data-field="note"]')),
  };
}

function definitionFormStates(list) {
  return [...(list?.querySelectorAll(".definition-form-card") || [])].map(definitionFormStateFromCard);
}

function definitionFormValue(definition, field) {
  return String(definition?.[field] || "");
}

function definitionOptionalFieldHtml(field, labelKey, value) {
  return `
    <label>
      <span>${escapeHtml(t(labelKey))}</span>
      <textarea data-field="${field}" rows="2">${escapeHtml(value)}</textarea>
    </label>
  `;
}

function definitionOptionalActionHtml(field, labelKey) {
  return `<button class="secondary-button additive-button" type="button" data-action="add-definition-optional" data-optional-definition-field="${field}">${escapeHtml(t(labelKey))}</button>`;
}

function definitionOptionalFieldsHtml(definition = {}) {
  const example = definitionFormValue(definition, "example");
  const note = definitionFormValue(definition, "note");
  const showExample = Boolean(example || definition.showExample);
  const showNote = Boolean(note || definition.showNote);
  const fields = [
    showExample ? definitionOptionalFieldHtml("example", "example", example) : "",
    showNote ? definitionOptionalFieldHtml("note", "definitionNote", note) : "",
  ].filter(Boolean);
  const actions = [
    showExample ? "" : definitionOptionalActionHtml("example", "addExample"),
    showNote ? "" : definitionOptionalActionHtml("note", "addDefinitionNote"),
  ].filter(Boolean);
  return `
    <div class="definition-optional-fields">
      ${fields.join("")}
      ${actions.length ? `<div class="definition-optional-actions">${actions.join("")}</div>` : ""}
    </div>
  `;
}

function definitionFormCardHtml(definition, index, removeAction) {
  return `
    <div class="definition-form-header">
      <strong>${escapeHtml(t("definitions"))} ${index + 1}</strong>
      <button class="danger-ghost" type="button" data-action="${removeAction}">${escapeHtml(t("removeDefinition"))}</button>
    </div>
    <label>
      <span>${escapeHtml(t("meaning"))}</span>
      <textarea data-field="meaning" rows="3">${escapeHtml(definitionFormValue(definition, "meaning"))}</textarea>
    </label>
    ${definitionOptionalFieldsHtml(definition)}
  `;
}

function definitionEditorItems(definitions) {
  return Array.isArray(definitions) && definitions.length ? definitions : [normalizeDefinition()];
}

function renderDefinitionFormList(definitions = []) {
  elements.definitionFormList.innerHTML = "";
  definitionEditorItems(definitions).forEach((definition, index) => {
    const block = document.createElement("article");
    block.className = "definition-form-card";
    block.dataset.definitionId = definition.id || uid("def");
    block.innerHTML = definitionFormCardHtml(definition, index, "remove-definition");
    elements.definitionFormList.append(block);
  });
  updateRemoveDefinitionButtons();
}

function updateRemoveDefinitionButtons() {
  const cards = elements.definitionFormList.querySelectorAll(".definition-form-card");
  cards.forEach((card) => {
    card.querySelector('[data-action="remove-definition"]').hidden = cards.length <= 1;
  });
}

function renderDefinitionFormCardInPlace(card, fieldToShow) {
  const list = card?.parentElement;
  if (!card || !list) {
    return;
  }
  const isPartial = list.dataset.partialDefinitions === "true";
  const definition = definitionFormStateFromCard(card);
  if (fieldToShow === "example") {
    definition.showExample = true;
  } else if (fieldToShow === "note") {
    definition.showNote = true;
  }
  const index = [...list.querySelectorAll(".definition-form-card")].indexOf(card);
  card.innerHTML = definitionFormCardHtml(
    definition,
    Math.max(0, index),
    isPartial ? "remove-partial-definition" : "remove-definition",
  );
  if (isPartial) {
    updatePartialRemoveDefinitionButtons(list);
  } else {
    updateRemoveDefinitionButtons();
  }
  card.querySelector(`[data-field="${fieldToShow}"]`)?.focus();
}

function collectDefinitions() {
  return definitionFormStates(elements.definitionFormList)
    .map(({ id, meaning, example, note }) => ({ id, meaning, example, note }))
    .filter((definition) => definition.meaning || definition.example || definition.note);
}

function entrySemanticSnapshot(entry = {}) {
  const morphologyState = morphologyModel.normalizeEntryMorphologyState(entry);
  return {
    lemma: String(entry.lemma || "").trim(),
    pronunciation: String(entry.pronunciation || "").trim(),
    tags: Array.isArray(entry.tags)
      ? entry.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
      : [],
    definitions: (entry.definitions || [])
      .map((definition) => ({
        id: String(definition?.id || ""),
        meaning: String(definition?.meaning || "").trim(),
        example: String(definition?.example || "").trim(),
        note: String(definition?.note || "").trim(),
      }))
      .filter((definition) => definition.meaning || definition.example || definition.note),
    etymology: {
      sources: Array.isArray(entry.etymology?.sources)
        ? entry.etymology.sources.map((source) => String(source || "").trim()).filter(Boolean)
        : [],
      description: String(entry.etymology?.description || "").trim(),
    },
    morphologyMode: morphologyState.morphologyMode,
    morphologyGroups: morphologyState.morphologyGroups.map((group) => ({
      templateGroupId: String(group.templateGroupId || ""),
      title: String(group.title || "").trim(),
      notes: String(group.notes || "").trim(),
      overrides: group.overrides || {},
    })),
    notes: String(entry.notes || "").trim(),
  };
}

function entriesHaveSameSemantics(left, right) {
  return stableJson(entrySemanticSnapshot(left)) === stableJson(entrySemanticSnapshot(right));
}

function fullEntryFormCandidate(existing = selectedEntry()) {
  const lemma = elements.lemmaInput.value.trim();
  const tags = splitList(elements.tagsInput.value);
  const morphologyState = collectMorphologyEntryState(elements.entryMorphologyControls, {
    ...(existing || {}),
    lemma,
    tags,
  });
  return {
    ...(existing || {}),
    id: existing?.id || "",
    lemma,
    pronunciation: elements.pronunciationInput.value.trim(),
    tags,
    definitions: collectDefinitions(),
    etymology: {
      sources: splitSourceText(elements.sourceEntryInput.value),
      description: elements.etymologyDescriptionInput.value.trim(),
    },
    morphologyMode: morphologyState.morphologyMode,
    morphologyGroups: morphologyState.morphologyGroups,
    notes: elements.notesInput.value.trim(),
  };
}

function fullEntryFormIsDirty() {
  if (elements.entryForm.hidden) {
    return false;
  }
  const existing = selectedEntry();
  const candidate = fullEntryFormCandidate(existing);
  return existing
    ? !entriesHaveSameSemantics(candidate, existing)
    : !entriesHaveSameSemantics(candidate, createEntryDraft());
}

function completeSourceAtCursor(input = elements.sourceEntryInput) {
  const dictionary = activeDictionary();
  if (!dictionary) {
    return false;
  }

  const value = input.value;
  const segment = sourceSegmentAtCursor(value, input.selectionStart ?? value.length);
  const prefix = segment.prefix;

  if (!prefix) {
    return false;
  }

  const match = sourceCompletionCandidates(prefix, dictionary)[0];
  if (!match) {
    return false;
  }

  const replacement = `${segment.leading}${match.lemma}${segment.trailing}`;
  const nextValue = `${value.slice(0, segment.start)}${replacement}${value.slice(segment.end)}`;
  input.value = nextValue;
  const nextCursor = segment.start + segment.leading.length + match.lemma.length;
  input.setSelectionRange(nextCursor, nextCursor);
  return true;
}

function sourceCompletionCandidates(prefix, dictionary = activeDictionary()) {
  const normalizeSearch = entrySearchQueryOptions(dictionary).normalizeText;
  const normalizedPrefix = normalizeSearch(prefix);
  if (!dictionary || !normalizedPrefix) {
    return [];
  }
  const fuzzyEnabled = normalizeDictionarySettings(dictionary.settings).search.etymologyAutocomplete.fuzzy;
  return dictionary.entries
    .map((entry) => {
      const lemma = normalizeSearch(entry.lemma);
      let score = 0;
      if (lemma.startsWith(normalizedPrefix)) {
        score = 1000 - Math.abs(lemma.length - normalizedPrefix.length);
      } else if (fuzzyEnabled && lemma.includes(normalizedPrefix)) {
        score = 700 - lemma.indexOf(normalizedPrefix);
      } else if (fuzzyEnabled) {
        score = entrySearchModel.fuzzyScore(entry.lemma, prefix, { normalizeText: normalizeSearch });
      }
      return { entry, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.lemma.localeCompare(b.entry.lemma, "zh-CN"))
    .slice(0, 6)
    .map((item) => item.entry);
}

function sourceAutocompleteBoxForInput(input = elements.sourceEntryInput) {
  if (input === elements.sourceEntryInput) {
    return elements.sourceSuggestionBox;
  }
  return input.closest("label")?.querySelector(".source-suggestions") || null;
}

function cancelSourceSuggestionHide() {
  if (sourceSuggestionHideTimer) {
    clearTimeout(sourceSuggestionHideTimer);
    sourceSuggestionHideTimer = 0;
  }
}

function scheduleSourceSuggestionHide(input = elements.sourceEntryInput) {
  cancelSourceSuggestionHide();
  sourceSuggestionHideTimer = window.setTimeout(() => {
    sourceSuggestionHideTimer = 0;
    const box = sourceAutocompleteBoxForInput(input);
    if (box && document.activeElement !== input && !box.contains(document.activeElement)) {
      box.hidden = true;
    }
  }, 120);
}

function renderSourceAutocomplete(input = elements.sourceEntryInput) {
  cancelSourceSuggestionHide();
  const box = sourceAutocompleteBoxForInput(input);
  if (!box) {
    return;
  }
  const segment = sourceSegmentAtCursor(input.value, input.selectionStart ?? input.value.length);
  const candidates = sourceCompletionCandidates(segment.prefix);
  if (sourceSuggestionIndex >= candidates.length) {
    sourceSuggestionIndex = 0;
  }
  box.innerHTML = "";
  box.hidden = !candidates.length || document.activeElement !== input;

  candidates.forEach((entry, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = index === sourceSuggestionIndex ? "selected" : "";
    button.textContent = entry.lemma;
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      fillSourceSegment(entry.lemma, input);
    });
    box.append(button);
  });
}

function selectedSourceCandidate(input = elements.sourceEntryInput) {
  const segment = sourceSegmentAtCursor(input.value, input.selectionStart ?? input.value.length);
  const candidates = sourceCompletionCandidates(segment.prefix);
  return candidates[sourceSuggestionIndex] || candidates[0] || null;
}

function fillSourceSegment(value, input = elements.sourceEntryInput) {
  const segment = sourceSegmentAtCursor(input.value, input.selectionStart ?? input.value.length);
  const replacement = `${segment.leading}${value}${segment.trailing}`;
  input.value = `${input.value.slice(0, segment.start)}${replacement}${input.value.slice(segment.end)}`;
  const nextCursor = segment.start + segment.leading.length + value.length;
  input.focus();
  input.setSelectionRange(nextCursor, nextCursor);
  renderSourceAutocomplete(input);
}

function handleSourceAutocompleteKeydown(event) {
  const input = event.currentTarget;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    const segment = sourceSegmentAtCursor(input.value, input.selectionStart ?? input.value.length);
    const candidates = sourceCompletionCandidates(segment.prefix);
    if (!candidates.length) {
      return;
    }
    event.preventDefault();
    sourceSuggestionIndex =
      event.key === "ArrowDown"
        ? (sourceSuggestionIndex + 1) % candidates.length
        : (sourceSuggestionIndex - 1 + candidates.length) % candidates.length;
    renderSourceAutocomplete(input);
    return;
  }

  if (event.key !== "Tab" && event.key !== "Enter") {
    return;
  }

  const segment = sourceSegmentAtCursor(input.value, input.selectionStart ?? input.value.length);
  if (!segment.prefix) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  const candidate = selectedSourceCandidate(input);
  if (candidate) {
    fillSourceSegment(candidate.lemma, input);
  }
}

function bindSourceAutocompleteInput(input) {
  if (!input) {
    return;
  }
  input.addEventListener("keydown", handleSourceAutocompleteKeydown);
  input.addEventListener("input", () => {
    sourceSuggestionIndex = 0;
    renderSourceAutocomplete(input);
  });
  input.addEventListener("click", () => {
    sourceSuggestionIndex = 0;
    renderSourceAutocomplete(input);
  });
  input.addEventListener("focus", () => renderSourceAutocomplete(input));
  input.addEventListener("blur", () => scheduleSourceSuggestionHide(input));
}

function sourceSegmentAtCursor(value, cursor) {
  const separators = /[,，、]/;
  const text = String(value || "");
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  let start = 0;
  let end = text.length;

  for (let index = safeCursor - 1; index >= 0; index -= 1) {
    if (separators.test(text[index])) {
      start = index + 1;
      break;
    }
  }

  for (let index = safeCursor; index < text.length; index += 1) {
    if (separators.test(text[index])) {
      end = index;
      break;
    }
  }

  const raw = text.slice(start, end);
  const leading = raw.match(/^\s*/)?.[0] || "";
  const trailing = raw.match(/\s*$/)?.[0] || "";
  const prefix = raw.slice(leading.length, raw.length - trailing.length).trim();
  return { start, end, leading, trailing, prefix };
}

function fillDictionaryForm(dictionary) {
  const isExisting = Boolean(dictionary);

  elements.dictionaryMode.textContent = isExisting ? t("config") : t("new");
  elements.dictionaryFormTitle.textContent = isExisting ? dictionary.name : t("newDictionary");
  elements.dictionaryId.value = dictionary?.id || "";
  elements.dictionaryNameInput.value = dictionary?.name || "";
  elements.dictionaryLanguageInput.value = dictionary?.language || "";
  elements.dictionaryDescriptionInput.value = dictionary?.description || "";
  elements.deleteDictionaryButton.hidden = !isExisting;
}

function fillGlossStyleForm(styles) {
  const normalized = normalizeGlossStyles(styles);
  elements.glossStyleRows.forEach((row) => {
    const key = row.dataset.glossStyle;
    const style = normalized[key];
    row.querySelector("[data-gloss-style-font]").value = style.fontFamily;
    row.querySelector("[data-gloss-style-size]").value = style.fontSize;
    row.querySelector("[data-gloss-style-bold]").checked = style.bold;
    row.querySelector("[data-gloss-style-italic]").checked = style.italic;
    const smallCapsInput = row.querySelector("[data-gloss-style-smallcaps]");
    if (smallCapsInput) {
      smallCapsInput.checked = Boolean(style.smallCaps);
    }
  });
}

function collectGlossStyleForm() {
  const styles = {};
  elements.glossStyleRows.forEach((row) => {
    const key = row.dataset.glossStyle;
    styles[key] = {
      fontFamily: normalizeGlossFontFamily(row.querySelector("[data-gloss-style-font]").value),
      fontSize: normalizeGlossFontSize(row.querySelector("[data-gloss-style-size]").value),
      bold: row.querySelector("[data-gloss-style-bold]").checked,
      italic: row.querySelector("[data-gloss-style-italic]").checked,
      ...(key === "glb" ? {
        smallCaps: row.querySelector("[data-gloss-style-smallcaps]").checked,
      } : {}),
    };
  });
  return normalizeGlossStyles(styles);
}

function collectEntrySearchSettingsForm() {
  const fields = Object.fromEntries(ENTRY_SEARCH_FIELD_KEYS.map((field) => {
    const enabled = elements.searchFieldEnabledInputs.find((input) => input.dataset.searchEnabled === field);
    const fuzzy = elements.searchFieldFuzzyInputs.find((input) => input.dataset.searchFuzzy === field);
    return [field, {
      enabled: Boolean(enabled?.checked),
      fuzzy: Boolean(fuzzy?.checked),
    }];
  }));
  return entrySearchModel.normalizeEntrySearchSettings({
    fields,
    normalization: {
      unicodeNormalization: elements.searchNfcInput?.checked ? "nfc" : "none",
      caseFolding: Boolean(elements.searchCaseFoldingInput?.checked),
      customRules: collectSearchNormalizationRules(),
    },
    etymologyAutocomplete: {
      fuzzy: Boolean(elements.sourceFuzzyInput?.checked),
    },
  });
}

function createSearchNormalizationRuleCard(rule = {}) {
  const card = document.createElement("div");
  card.className = "search-normalization-rule-card";
  card.innerHTML = `
    <label>
      <span>${escapeHtml(t("searchCanonical"))}</span>
      <input type="text" data-search-rule-canonical value="${escapeHtml(rule.canonical || "")}">
    </label>
    <label>
      <span>${escapeHtml(t("searchVariants"))}</span>
      <textarea data-search-rule-variants>${escapeHtml((rule.variants || []).join("\n"))}</textarea>
    </label>
    <button class="danger-ghost" type="button" data-action="remove-search-normalization-rule">${escapeHtml(t("removeSearchNormalizationRule"))}</button>
  `;
  return card;
}

function collectSearchNormalizationRules() {
  return [...(elements.searchNormalizationRuleList?.children || [])].map((card) => ({
    canonical: card.querySelector("[data-search-rule-canonical]")?.value.trim() || "",
    variants: String(card.querySelector("[data-search-rule-variants]")?.value || "")
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean),
  }));
}

function fillSearchNormalizationRules(rules = []) {
  if (!elements.searchNormalizationRuleList) {
    return;
  }
  elements.searchNormalizationRuleList.replaceChildren(
    ...rules.map((rule) => createSearchNormalizationRuleCard(rule)),
  );
}

function fillEntrySearchSettingsForm(search) {
  const normalized = entrySearchModel.normalizeEntrySearchSettings(search);
  elements.searchFieldEnabledInputs.forEach((input) => {
    input.checked = normalized.fields[input.dataset.searchEnabled]?.enabled ?? true;
  });
  elements.searchFieldFuzzyInputs.forEach((input) => {
    input.checked = normalized.fields[input.dataset.searchFuzzy]?.fuzzy ?? true;
  });
  elements.searchNfcInput.checked = normalized.normalization.unicodeNormalization === "nfc";
  elements.searchCaseFoldingInput.checked = normalized.normalization.caseFolding;
  fillSearchNormalizationRules(normalized.normalization.customRules);
  elements.sourceFuzzyInput.checked = normalized.etymologyAutocomplete.fuzzy;
  syncEntrySearchSettingsControls();
}

function searchNormalizationValidationMessage(error = {}) {
  if (["empty_canonical", "invalid_canonical"].includes(error.code)) {
    return t("searchNormalizationEmptyCanonical");
  }
  if (["empty_variants", "empty_variant", "invalid_variants", "invalid_variant"].includes(error.code)) {
    return t("searchNormalizationEmptyVariants");
  }
  if (error.code === "conflicting_variant") {
    return t("searchNormalizationConflictingVariant");
  }
  return t("searchNormalizationInvalidRule");
}

function validateSearchNormalizationForm(search) {
  const runtime = searchNormalizationModel.createConfiguredSearchNormalizer(search.normalization);
  const error = runtime.errors[0];
  if (!error) {
    return true;
  }
  showToast(searchNormalizationValidationMessage(error));
  const card = elements.searchNormalizationRuleList?.children[error.index];
  card?.querySelector(error.code.includes("canonical")
    ? "[data-search-rule-canonical]"
    : "[data-search-rule-variants]")?.focus();
  return false;
}

function syncEntrySearchSettingsControls() {
  elements.searchFieldEnabledInputs.forEach((enabledInput) => {
    const field = enabledInput.dataset.searchEnabled;
    const fuzzyInput = elements.searchFieldFuzzyInputs.find((input) => input.dataset.searchFuzzy === field);
    const row = enabledInput.closest(".search-field-setting");
    if (fuzzyInput) {
      fuzzyInput.disabled = !enabledInput.checked;
    }
    row?.classList.toggle("is-search-disabled", !enabledInput.checked);
  });
}

function fillSettingsForm(dictionary) {
  const settings = normalizeDictionarySettings(dictionary?.settings);
  fillGlossStyleForm(settings.glossStyles);
  elements.corpusUnitCardRenderPatternInput.value = settings.corpusUnitCardRenderPattern;
  elements.corpusUnitCardGlossAlignInput.checked = settings.corpusUnitCardGlossAlign;
  elements.corpusUnitRenderPatternInput.value = settings.corpusUnitRenderPattern;
  elements.corpusUnitGlossAlignInput.checked = settings.corpusUnitGlossAlign;
  elements.entryExampleRenderPatternInput.value = settings.entryExampleRenderPattern;
  elements.entryExampleGlossAlignInput.checked = settings.entryExampleGlossAlign;
  elements.tagDisplayMapInput.value = serializeTagDisplayMap(settings.tagDisplayMap);
  elements.entryListRawTagDisplayInput.checked = settings.entryListRawTagDisplay;
  elements.entryListTagDisplayLimitInput.value = settings.entryListTagDisplayLimit;
  elements.entryListPartDisplayInput.value = settings.entryListPartDisplay;
  elements.manualPartOfSpeechTagsInput.checked = settings.manualPartOfSpeechTags;
  elements.partOfSpeechTagsInput.value = settings.partOfSpeechTags.join(", ");
  syncPartOfSpeechTagSettingsControls();
  elements.tagSortOrderInput.value = settings.tagSortOrder.join(", ");
  elements.tagRedHighlightInput.value = settings.redHighlightTags.join("\n");
  elements.entryListTagFilteringInput.checked = settings.entryListTagFiltering;
  elements.entryListPolysemyInput.checked = settings.entryListPolysemyDisplay;
  elements.networkPolysemyInput.checked = settings.networkPolysemyDisplay;
  elements.showEmptyEntrySectionsInput.checked = settings.showEmptyEntrySections;
  fillEntrySearchSettingsForm(settings.search);
  elements.searchHighlightInput.checked = settings.searchHighlight;
  elements.savePartialOnSwitchInput.value = settings.partialEditPageSwitchAction;
  elements.saveFullOnSwitchInput.value = settings.fullEditPageSwitchAction;
  elements.corpusAutoSaveInput.checked = settings.corpusAutoSave;
  elements.docsAutoSaveInput.checked = settings.docsAutoSave;
  elements.allowEmptyPronunciationInput.checked = settings.allowEmptyPronunciation;
  elements.allowEmptyTagsInput.checked = settings.allowEmptyTags;
  elements.allowEmptyDefinitionsInput.checked = settings.allowEmptyDefinitions;
  elements.ipaKeyboardInput.value = normalizeIpaKeyboard(settings.ipaKeyboard).join(" ");
  renderEntrySectionOrderEditor(settings.entrySectionOrder);
  renderToolNavOrderEditor(settings.toolNavOrder);
  setupMasonryLayout(elements.settingsForm, ".settings-section, .form-actions", 18);
}

function syncPartOfSpeechTagSettingsControls() {
  const enabled = Boolean(elements.manualPartOfSpeechTagsInput?.checked);
  if (elements.partOfSpeechTagsInput) {
    elements.partOfSpeechTagsInput.disabled = !enabled;
  }
}

function renderToolNavOrderEditor(order = DEFAULT_TOOL_NAV_ORDER) {
  if (!elements.toolNavOrderList) {
    return;
  }
  elements.toolNavOrderList.innerHTML = "";
  normalizeToolNavOrder(order).forEach((view) => {
    const card = document.createElement("article");
    card.className = "tool-order-card";
    card.draggable = true;
    card.dataset.view = view;
    card.innerHTML = `
      <span class="tool-order-handle" aria-hidden="true">⋮⋮</span>
      <strong>${escapeHtml(toolNavLabel(view))}</strong>
    `;
    elements.toolNavOrderList.append(card);
  });
}

function renderEntrySectionOrderEditor(order = DEFAULT_ENTRY_SECTION_ORDER) {
  if (!elements.entrySectionOrderList) {
    return;
  }
  elements.entrySectionOrderList.innerHTML = "";
  normalizeEntrySectionOrder(order).forEach((section) => {
    const card = document.createElement("article");
    card.className = "tool-order-card";
    card.draggable = true;
    card.dataset.entrySection = section;
    card.innerHTML = `
      <span class="tool-order-handle" aria-hidden="true">⋮⋮</span>
      <strong>${escapeHtml(entrySectionLabel(section))}</strong>
    `;
    elements.entrySectionOrderList.append(card);
  });
}

function collectToolNavOrder() {
  return normalizeToolNavOrder([...elements.toolNavOrderList?.querySelectorAll(".tool-order-card") || []]
    .map((card) => card.dataset.view));
}

function collectEntrySectionOrder() {
  return normalizeEntrySectionOrder([...elements.entrySectionOrderList?.querySelectorAll(".tool-order-card") || []]
    .map((card) => card.dataset.entrySection));
}

function toolOrderInsertBefore(y) {
  const cards = [...(elements.toolNavOrderList?.querySelectorAll(".tool-order-card:not(.dragging)") || [])];
  return cards.reduce((closest, card) => {
    const box = card.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, card };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, card: null }).card;
}

function entrySectionOrderInsertBefore(y) {
  const cards = [...(elements.entrySectionOrderList?.querySelectorAll(".tool-order-card:not(.dragging)") || [])];
  return cards.reduce((closest, card) => {
    const box = card.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, card };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, card: null }).card;
}

function renderIpaKeyboard(dictionary = activeDictionary()) {
  const symbols = normalizeIpaKeyboard(dictionary?.settings?.ipaKeyboard);
  elements.ipaKeyboard.innerHTML = "";
  symbols.forEach((symbol) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ipa-key";
    button.textContent = symbol;
    button.setAttribute("aria-label", formatText("insertSymbol", { symbol }));
    button.addEventListener("click", () => insertPronunciationSymbol(symbol));
    elements.ipaKeyboard.append(button);
  });
}

function renderPartialIpaKeyboard(dictionary = activeDictionary()) {
  const keyboard = partialEditBody()?.querySelector(".partial-ipa-keyboard");
  const input = partialEditBody()?.querySelector('[data-field="pronunciation"]');
  if (!keyboard || !input) {
    return;
  }
  keyboard.innerHTML = "";
  normalizeIpaKeyboard(dictionary?.settings?.ipaKeyboard).forEach((symbol) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ipa-key";
    button.textContent = symbol;
    button.setAttribute("aria-label", formatText("insertSymbol", { symbol }));
    button.addEventListener("click", () => insertSymbolIntoInput(symbol, input));
    keyboard.append(button);
  });
}

function insertPronunciationSymbol(symbol) {
  insertSymbolIntoInput(symbol, elements.pronunciationInput);
}

function insertSymbolIntoInput(symbol, input) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.value = `${input.value.slice(0, start)}${symbol}${input.value.slice(end)}`;
  const nextCursor = start + symbol.length;
  input.focus();
  input.setSelectionRange(nextCursor, nextCursor);
}

function fillIpaForm(dictionary) {
  const ipa = normalizeIpaSettings(dictionary?.settings?.ipa);
  renderIpaRuleList(elements.ipaMappingList, ipa.mappings);
  elements.ipaVowelsInput.value = ipa.syllable.vowels;
  elements.ipaSyllableSeparatorInput.value = ipa.syllable.separator;
  elements.ipaOnsetClustersInput.value = ipa.syllable.onsetClusters.join(", ");
  elements.ipaCodaClustersInput.value = ipa.syllable.codaClusters.join(", ");
  elements.ipaComplexPhonemesInput.value = ipa.syllable.complexPhonemes.join(", ");
  elements.ipaDefaultStressInput.value = ipa.defaultStress;
  elements.ipaUnstressMonosyllablesInput.checked = ipa.unstressMonosyllables;
}

function renderIpaRuleList(container, rules) {
  container.innerHTML = "";
  rules.forEach((rule) => {
    container.append(createIpaRuleCard(rule));
  });
}

function createIpaRuleCard(rule = normalizeIpaRule()) {
  const card = document.createElement("article");
  card.className = "ipa-rule-card";
  card.innerHTML = `
    <div class="ipa-rule-grid">
      <button class="ipa-rule-drag-handle" type="button" draggable="true" data-app-tooltip="always" aria-label="${escapeHtml(t("reorderIpaRule"))}">⋮⋮</button>
      <textarea class="ipa-single-line" rows="1" data-field="from" aria-label="${escapeHtml(t("ruleFrom"))}" placeholder="${escapeHtml(t("ruleFrom"))}">${escapeHtml(rule.from)}</textarea>
      <textarea class="ipa-single-line" rows="1" data-field="to" aria-label="${escapeHtml(t("ruleTo"))}" placeholder="${escapeHtml(t("ruleTo"))}">${escapeHtml(rule.to)}</textarea>
      <textarea class="ipa-single-line" rows="1" data-field="before" aria-label="${escapeHtml(t("ruleBefore"))}" placeholder="${escapeHtml(t("ruleBefore"))}">${escapeHtml(rule.before)}</textarea>
      <textarea class="ipa-single-line" rows="1" data-field="after" aria-label="${escapeHtml(t("ruleAfter"))}" placeholder="${escapeHtml(t("ruleAfter"))}">${escapeHtml(rule.after)}</textarea>
      <button class="icon-danger-button" type="button" data-action="remove-ipa-rule" data-app-tooltip="always" aria-label="${escapeHtml(t("removeRule"))}">🗑</button>
    </div>
  `;
  return card;
}

function ipaRuleInsertBefore(container, y) {
  const cards = [...container.querySelectorAll(".ipa-rule-card:not(.dragging)")];
  return cards.reduce((closest, card) => {
    const box = card.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, card };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, card: null }).card;
}

function finishIpaRuleDrag() {
  elements.ipaMappingList.querySelector(".ipa-rule-card.dragging")?.classList.remove("dragging");
  renderIpaSandbox();
}

function collectIpaRuleList(container) {
  return [...container.querySelectorAll(".ipa-rule-card")]
    .map((card) => normalizeIpaRule({
      from: card.querySelector('[data-field="from"]').value.trim(),
      to: card.querySelector('[data-field="to"]').value.trim(),
      before: card.querySelector('[data-field="before"]').value.trim(),
      after: card.querySelector('[data-field="after"]').value.trim(),
    }))
    .filter((rule) => rule.from || rule.to || rule.before || rule.after);
}

function addIpaRule(container) {
  container.append(createIpaRuleCard());
  container.querySelector('.ipa-rule-card:last-child [data-field="from"]')?.focus();
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function dictionaryFormSnapshot() {
  return {
    id: elements.dictionaryId.value,
    name: elements.dictionaryNameInput.value.trim(),
    language: elements.dictionaryLanguageInput.value.trim(),
    description: elements.dictionaryDescriptionInput.value.trim(),
  };
}

function savedDictionarySnapshot(dictionary = selectedDictionaryConfig()) {
  return {
    id: dictionary?.id || "",
    name: dictionary?.name || "",
    language: dictionary?.language || "",
    description: dictionary?.description || "",
  };
}

function settingsFormSnapshot() {
  return {
    glossStyles: collectGlossStyleForm(),
    corpusUnitCardRenderPattern: elements.corpusUnitCardRenderPatternInput.value.trim(),
    corpusUnitCardGlossAlign: elements.corpusUnitCardGlossAlignInput.checked,
    corpusUnitRenderPattern: elements.corpusUnitRenderPatternInput.value.trim(),
    corpusUnitGlossAlign: elements.corpusUnitGlossAlignInput.checked,
    entryExampleRenderPattern: elements.entryExampleRenderPatternInput.value.trim(),
    entryExampleGlossAlign: elements.entryExampleGlossAlignInput.checked,
    corpusAutoSave: elements.corpusAutoSaveInput.checked,
    docsAutoSave: elements.docsAutoSaveInput.checked,
    tagDisplayMap: normalizeTagDisplayMap(parseTagDisplayMap(elements.tagDisplayMapInput.value)),
    entryListRawTagDisplay: elements.entryListRawTagDisplayInput.checked,
    entryListTagDisplayLimit: normalizeEntryListTagDisplayLimit(elements.entryListTagDisplayLimitInput.value),
    entryListPartDisplay: normalizeEntryListPartDisplay(elements.entryListPartDisplayInput.value),
    manualPartOfSpeechTags: elements.manualPartOfSpeechTagsInput.checked,
    partOfSpeechTags: normalizeTagList(elements.partOfSpeechTagsInput.value),
    tagSortOrder: normalizeTagList(elements.tagSortOrderInput.value),
    redHighlightTags: normalizeRedHighlightTags(elements.tagRedHighlightInput.value),
    entryListTagFiltering: elements.entryListTagFilteringInput.checked,
    entryListPolysemyDisplay: elements.entryListPolysemyInput.checked,
    networkPolysemyDisplay: elements.networkPolysemyInput.checked,
    showEmptyEntrySections: elements.showEmptyEntrySectionsInput.checked,
    entrySectionOrder: collectEntrySectionOrder(),
    search: collectEntrySearchSettingsForm(),
    searchHighlight: elements.searchHighlightInput.checked,
    partialEditPageSwitchAction: normalizeEditPageSwitchAction(elements.savePartialOnSwitchInput.value),
    fullEditPageSwitchAction: normalizeEditPageSwitchAction(elements.saveFullOnSwitchInput.value),
    allowEmptyPronunciation: elements.allowEmptyPronunciationInput.checked,
    allowEmptyTags: elements.allowEmptyTagsInput.checked,
    allowEmptyDefinitions: elements.allowEmptyDefinitionsInput.checked,
    ipaKeyboard: normalizeIpaKeyboard(elements.ipaKeyboardInput.value),
    toolNavOrder: collectToolNavOrder(),
  };
}

function savedSettingsSnapshot(dictionary = activeDictionary()) {
  const settings = normalizeDictionarySettings(dictionary?.settings);
  return {
    glossStyles: settings.glossStyles,
    corpusUnitCardRenderPattern: settings.corpusUnitCardRenderPattern,
    corpusUnitCardGlossAlign: settings.corpusUnitCardGlossAlign,
    corpusUnitRenderPattern: settings.corpusUnitRenderPattern,
    corpusUnitGlossAlign: settings.corpusUnitGlossAlign,
    entryExampleRenderPattern: settings.entryExampleRenderPattern,
    entryExampleGlossAlign: settings.entryExampleGlossAlign,
    corpusAutoSave: settings.corpusAutoSave,
    docsAutoSave: settings.docsAutoSave,
    tagDisplayMap: settings.tagDisplayMap,
    entryListRawTagDisplay: settings.entryListRawTagDisplay,
    entryListTagDisplayLimit: settings.entryListTagDisplayLimit,
    entryListPartDisplay: settings.entryListPartDisplay,
    manualPartOfSpeechTags: settings.manualPartOfSpeechTags,
    partOfSpeechTags: settings.partOfSpeechTags,
    tagSortOrder: settings.tagSortOrder,
    redHighlightTags: settings.redHighlightTags,
    entryListTagFiltering: settings.entryListTagFiltering,
    entryListPolysemyDisplay: settings.entryListPolysemyDisplay,
    networkPolysemyDisplay: settings.networkPolysemyDisplay,
    showEmptyEntrySections: settings.showEmptyEntrySections,
    entrySectionOrder: settings.entrySectionOrder,
    search: settings.search,
    searchHighlight: settings.searchHighlight,
    partialEditPageSwitchAction: settings.partialEditPageSwitchAction,
    fullEditPageSwitchAction: settings.fullEditPageSwitchAction,
    allowEmptyPronunciation: settings.allowEmptyPronunciation,
    allowEmptyTags: settings.allowEmptyTags,
    allowEmptyDefinitions: settings.allowEmptyDefinitions,
    ipaKeyboard: settings.ipaKeyboard,
    toolNavOrder: settings.toolNavOrder,
  };
}

function ipaFormSnapshot() {
  const defaultStressRaw = elements.ipaDefaultStressInput.value.trim();
  const ipa = normalizeIpaSettings({
    mappings: collectIpaRuleList(elements.ipaMappingList),
    syllable: {
      vowels: elements.ipaVowelsInput.value.trim() || "aeiouAEIOU",
      separator: elements.ipaSyllableSeparatorInput.value.trim() || ".",
      onsetClusters: normalizeClusterList(elements.ipaOnsetClustersInput.value),
      codaClusters: normalizeClusterList(elements.ipaCodaClustersInput.value),
      complexPhonemes: normalizeClusterList(elements.ipaComplexPhonemesInput.value),
    },
    defaultStress: defaultStressRaw,
    unstressMonosyllables: elements.ipaUnstressMonosyllablesInput.checked,
  });
  return {
    mappings: ipa.mappings,
    syllable: ipa.syllable,
    defaultStress: defaultStressRaw,
    unstressMonosyllables: ipa.unstressMonosyllables,
  };
}

function morphologyFunctionsFormSnapshot() {
  return normalizeMorphologyFunctions(collectMorphologyFunctions());
}

function morphologyTablesFormSnapshot() {
  return normalizeMorphology({
    functions: morphologyFunctionConfig(),
    templateGroups: collectMorphologyTemplateGroups(),
  });
}

function savedMorphologySnapshot(dictionary = activeDictionary()) {
  return normalizeMorphology(dictionary?.morphology);
}

function savedIpaSnapshot(dictionary = activeDictionary()) {
  const ipa = normalizeIpaSettings(dictionary?.settings?.ipa);
  return {
    mappings: ipa.mappings,
    syllable: ipa.syllable,
    defaultStress: String(ipa.defaultStress),
    unstressMonosyllables: ipa.unstressMonosyllables,
  };
}

function settingsFormIsDirty() {
  return stableJson(settingsFormSnapshot()) !== stableJson(savedSettingsSnapshot());
}

function ipaFormIsDirty() {
  return stableJson(ipaFormSnapshot()) !== stableJson(savedIpaSnapshot());
}

function dictionaryFormIsDirty() {
  return stableJson(dictionaryFormSnapshot()) !== stableJson(savedDictionarySnapshot());
}

function morphologyFunctionsFormIsDirty() {
  return stableJson(morphologyFunctionsFormSnapshot()) !== stableJson(savedMorphologySnapshot().functions);
}

function morphologyTablesFormIsDirty() {
  return stableJson(morphologyTablesFormSnapshot().templateGroups) !== stableJson(savedMorphologySnapshot().templateGroups);
}

async function confirmLeaveUnsavedDictionaryForm() {
  if (!dictionaryFormIsDirty()) {
    return true;
  }
  return confirmUnsavedChanges(t("unsavedDictionaryConfirm"), {
    save: () => saveDictionary({ preventDefault() {} }),
  });
}

async function confirmUnsavedChanges(message, actions = {}) {
  const action = await appEditSwitchPrompt(message);
  if (action === "cancel" || action === false) {
    return false;
  }
  try {
    if (action === "save") {
      const saved = await actions.save?.();
      return saved !== false;
    }
    if (action === "discard") {
      await actions.discard?.();
      return true;
    }
  } catch (error) {
    console.error(error);
    return false;
  }
  return true;
}

function discardDocsDraft() {
  clearTimeout(docsSaveTimer);
  docsDraftState = null;
}

function discardCorpusDraft() {
  clearTimeout(corpusSaveTimer);
  corpusSaveTimer = null;
  corpusSaveRequested = false;
  corpusDraftState = null;
}

function invalidSettingsRenderPatternInput() {
  const renderPatternInputs = [
    elements.corpusUnitCardRenderPatternInput,
    elements.corpusUnitRenderPatternInput,
    elements.entryExampleRenderPatternInput,
  ];
  return renderPatternInputs.find((input) => parseCorpusRenderPattern(input.value).error) || null;
}

function collectDictionarySettingsFromForm(existing = {}) {
  return {
    ...(existing || {}),
    glossStyles: collectGlossStyleForm(),
    corpusUnitCardRenderPattern: elements.corpusUnitCardRenderPatternInput.value.trim(),
    corpusUnitCardGlossAlign: elements.corpusUnitCardGlossAlignInput.checked,
    corpusUnitRenderPattern: elements.corpusUnitRenderPatternInput.value.trim(),
    corpusUnitGlossAlign: elements.corpusUnitGlossAlignInput.checked,
    entryExampleRenderPattern: elements.entryExampleRenderPatternInput.value.trim(),
    entryExampleGlossAlign: elements.entryExampleGlossAlignInput.checked,
    corpusAutoSave: elements.corpusAutoSaveInput.checked,
    docsAutoSave: elements.docsAutoSaveInput.checked,
    tagDisplayMap: parseTagDisplayMap(elements.tagDisplayMapInput.value),
    entryListRawTagDisplay: elements.entryListRawTagDisplayInput.checked,
    entryListTagDisplayLimit: normalizeEntryListTagDisplayLimit(elements.entryListTagDisplayLimitInput.value),
    entryListPartDisplay: normalizeEntryListPartDisplay(elements.entryListPartDisplayInput.value),
    manualPartOfSpeechTags: elements.manualPartOfSpeechTagsInput.checked,
    partOfSpeechTags: normalizeTagList(elements.partOfSpeechTagsInput.value),
    tagSortOrder: normalizeTagList(elements.tagSortOrderInput.value),
    redHighlightTags: normalizeRedHighlightTags(elements.tagRedHighlightInput.value),
    entryListTagFiltering: elements.entryListTagFilteringInput.checked,
    entryListPolysemyDisplay: elements.entryListPolysemyInput.checked,
    networkPolysemyDisplay: elements.networkPolysemyInput.checked,
    showEmptyEntrySections: elements.showEmptyEntrySectionsInput.checked,
    entrySectionOrder: collectEntrySectionOrder(),
    search: collectEntrySearchSettingsForm(),
    searchHighlight: elements.searchHighlightInput.checked,
    partialEditPageSwitchAction: normalizeEditPageSwitchAction(elements.savePartialOnSwitchInput.value),
    fullEditPageSwitchAction: normalizeEditPageSwitchAction(elements.saveFullOnSwitchInput.value),
    allowEmptyPronunciation: elements.allowEmptyPronunciationInput.checked,
    allowEmptyTags: elements.allowEmptyTagsInput.checked,
    allowEmptyDefinitions: elements.allowEmptyDefinitionsInput.checked,
    ipaKeyboard: normalizeIpaKeyboard(elements.ipaKeyboardInput.value),
    toolNavOrder: collectToolNavOrder(),
  };
}

async function saveSettings(event, options = {}) {
  event.preventDefault();
  const dictionary = activeDictionary();
  if (!dictionary) {
    showToast(t("createDictionaryFirstToast"));
    return false;
  }

  if (!settingsFormIsDirty()) {
    if (options.showToast !== false) {
      showToast(t("noChangesToSave"));
    }
    return true;
  }

  if (!entryListTagDisplayLimitInputIsValid()) {
    showToast(t("entryListTagDisplayLimitInvalid"));
    elements.entryListTagDisplayLimitInput.focus();
    return false;
  }

  const entrySearchSettings = collectEntrySearchSettingsForm();
  if (!entrySearchModel.searchSettingsHaveEnabledField(entrySearchSettings)) {
    showToast(t("searchFieldRequired"));
    elements.searchFieldEnabledInputs[0]?.focus();
    return false;
  }
  if (!validateSearchNormalizationForm(entrySearchSettings)) {
    return false;
  }

  const invalidRenderPatternInput = invalidSettingsRenderPatternInput();
  if (invalidRenderPatternInput) {
    await appConfirm(t("invalidCorpusRenderPattern"), {
      title: t("corpusRenderError"),
      alert: true,
    });
    invalidRenderPatternInput.focus();
    return false;
  }

  const settings = collectDictionarySettingsFromForm(dictionary.settings);
  if (!settings.docsAutoSave) {
    clearTimeout(docsSaveTimer);
  }
  if (!settings.corpusAutoSave) {
    clearTimeout(corpusSaveTimer);
  }
  try {
    const saved = await api(`/api/dictionaries/${encodeURIComponent(dictionary.id)}/settings`, {
      method: "PUT",
      body: JSON.stringify(settings),
    });
    applyDictionaryModulePayload(saved);
    resetEntryReadStateAfterSave();
    render();
    if (options.showToast !== false) {
      showToast(t("dictionarySaved"));
    }
    return true;
  } catch (error) {
    showApiErrorToast(error, "dictionarySaveFailed");
    return false;
  }
}

async function applyTagSortOrder() {
  let dictionary = activeDictionary();
  if (!dictionary) {
    showToast(t("createDictionaryFirstToast"));
    return;
  }

  let order = normalizeTagList(elements.tagSortOrderInput.value);
  if (!order.length) {
    await appConfirm(t("tagOrderEmpty"), {
      title: t("tagOrderSettings"),
      alert: true,
    });
    elements.tagSortOrderInput.focus();
    return;
  }

  const invalidRenderPatternInput = invalidSettingsRenderPatternInput();
  if (invalidRenderPatternInput) {
    await appConfirm(t("invalidCorpusRenderPattern"), {
      title: t("corpusRenderError"),
      alert: true,
    });
    invalidRenderPatternInput.focus();
    return;
  }

  if (settingsFormIsDirty()) {
    const shouldSave = await appConfirm(t("tagOrderUnsavedSettingsConfirm"), {
      title: t("tagOrderSettings"),
      confirmText: t("saveAndApply"),
      cancelText: t("cancel"),
    });
    if (!shouldSave) {
      return;
    }
    const saved = await saveSettings({ preventDefault() {} }, { showToast: false });
    if (!saved) {
      return;
    }
    dictionary = activeDictionary();
    order = normalizeTagList(dictionary.settings?.tagSortOrder);
  }

  const confirmed = await appConfirm(t("tagOrderConfirm"), {
    title: t("tagOrderSettings"),
  });
  if (!confirmed) {
    return;
  }

  let changedEntries = 0;
  const settings = dictionary.settings;
  const updates = (dictionary.entries || []).map((entry) => {
    const sortedTags = arrangeTagsByOrder(entry.tags || [], order);
    if (stableJson(sortedTags) === stableJson(entry.tags || [])) {
      return null;
    }
    changedEntries += 1;
    return {
      id: entry.id,
      patch: { tags: sortedTags },
    };
  }).filter(Boolean);
  try {
    const saved = await api(`/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries`, {
      method: "PATCH",
      body: JSON.stringify({ settings, updates }),
    });
    applyEntryPatchPayload(saved);
    resetEntryReadStateAfterSave();
    render();
    showToast(`${t("tagOrderApplied")}${changedEntries ? ` · ${changedEntries} ${t("entries")}` : ""}`);
  } catch (error) {
    showApiErrorToast(error, "saveFailed");
  }
}

function renderLanguageDocs(dictionary) {
  const markdown = ensureDocsDraft(dictionary)?.markdown || "";
  elements.docsPanel.dataset.mode = docsViewMode;
  elements.docsModeControl.querySelectorAll("[data-doc-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.docMode === docsViewMode);
  });

  if (document.activeElement !== elements.docsMarkdownInput && elements.docsMarkdownInput.value !== markdown) {
    elements.docsMarkdownInput.value = markdown;
  }
  elements.docsPreview.innerHTML = renderMarkdown(markdown);
  if (dictionary && normalizeDictionarySettings(dictionary.settings).docsAutoSave && docsFormIsDirty(dictionary)) {
    scheduleDocsSave();
  }
}

function ensureDocsDraft(dictionary = activeDictionary()) {
  if (!dictionary) {
    return null;
  }
  if (!docsDraftState || docsDraftState.dictionaryId !== dictionary.id) {
    docsDraftState = {
      dictionaryId: dictionary.id,
      markdown: String(dictionary.docs?.markdown || ""),
    };
  }
  return docsDraftState;
}

function docsFormIsDirty(dictionary = activeDictionary()) {
  if (!dictionary || docsDraftState?.dictionaryId !== dictionary.id) {
    return false;
  }
  return docsDraftState.markdown !== String(dictionary.docs?.markdown || "");
}

async function saveLanguageDocs(showSavedToast = true) {
  const dictionary = activeDictionary();
  if (!dictionary) {
    showToast(t("createDictionaryFirstToast"));
    return false;
  }
  clearTimeout(docsSaveTimer);
  if (!docsFormIsDirty(dictionary)) {
    if (showSavedToast) {
      showToast(t("noChangesToSave"));
    }
    return true;
  }
  const draft = ensureDocsDraft(dictionary);
  const docs = {
    ...(dictionary.docs || {}),
    markdown: draft.markdown,
  };
  try {
    const saved = await api(`/api/dictionaries/${encodeURIComponent(dictionary.id)}/docs`, {
      method: "PUT",
      body: JSON.stringify(docs),
    });
    applyDictionaryModulePayload(saved);
    docsDraftState = null;
    render();
    renderLanguageDocs(activeDictionary());
    if (showSavedToast) {
      showToast(t("docsSaved"));
    }
    return true;
  } catch (error) {
    if (showSavedToast) {
      showApiErrorToast(error, "saveFailed");
    } else {
      console.error(error);
    }
    return false;
  }
}

function scheduleDocsSave() {
  clearTimeout(docsSaveTimer);
  const dictionary = activeDictionary();
  if (!dictionary || !normalizeDictionarySettings(dictionary.settings).docsAutoSave || !docsFormIsDirty(dictionary)) {
    return;
  }
  docsSaveTimer = setTimeout(() => {
    saveLanguageDocs(false).catch((error) => console.error(error));
  }, 700);
}

function cloneCorpus(corpus = {}) {
  return JSON.parse(JSON.stringify(normalizeCorpus(corpus)));
}

function createCorpusViewState() {
  return {
    mode: "blocks",
    query: "",
    selectedBlockId: "",
    selectedUnitId: "",
  };
}

function activeCorpusViewState() {
  const dictionaryId = state.activeDictionaryId || "__none__";
  if (!corpusViewStates.has(dictionaryId)) {
    corpusViewStates.set(dictionaryId, createCorpusViewState());
  }
  return corpusViewStates.get(dictionaryId);
}

function ensureCorpusDraft(dictionary = activeDictionary()) {
  if (!dictionary) {
    return null;
  }
  if (!corpusDraftState || corpusDraftState.dictionaryId !== dictionary.id) {
    corpusDraftState = {
      dictionaryId: dictionary.id,
      corpus: cloneCorpus(dictionary.corpus),
    };
  }
  return corpusDraftState.corpus;
}

function corpusParentRefs(corpus = ensureCorpusDraft()) {
  if (!corpus) {
    return [];
  }
  const refs = [];
  corpus.blocks.forEach((block) => {
    refs.push({
      key: `block:${block.id}`,
      type: "block",
      block,
      layer: null,
      unitIds: block.unitIds,
    });
    block.layers.forEach((layer) => {
      refs.push({
        key: `layer:${block.id}:${layer.id}`,
        type: "layer",
        block,
        layer,
        unitIds: layer.unitIds,
      });
    });
  });
  return refs;
}

function corpusParentLabel(ref) {
  if (!ref) {
    return t("corpusOrphan");
  }
  const blockTitle = ref.block.title || t("corpusBlockFallback");
  if (ref.type === "block") {
    return `${t("corpusBlockParent")}: ${blockTitle}`;
  }
  const layerName = ref.layer.name || t("corpusLayerFallback");
  return `${t("corpusLayerParent")}: ${blockTitle} / ${layerName}`;
}

function corpusParentsForUnit(unitId, corpus = ensureCorpusDraft()) {
  return corpusParentRefs(corpus).filter((ref) => ref.unitIds.includes(unitId));
}

function corpusOwnerByKey(ownerKey, corpus = ensureCorpusDraft()) {
  return corpusParentRefs(corpus).find((ref) => ref.key === ownerKey) || null;
}

function moveCorpusUnitToParent(corpus, unitId, ownerKey = "") {
  const currentParents = corpusParentsForUnit(unitId, corpus);
  const currentOccurrences = currentParents.reduce(
    (count, ref) => count + ref.unitIds.filter((id) => id === unitId).length,
    0,
  );
  if (
    (currentParents.length === 0 && !ownerKey)
    || (currentParents.length === 1 && currentOccurrences === 1 && currentParents[0].key === ownerKey)
  ) {
    return;
  }
  corpusParentRefs(corpus).forEach((ref) => {
    ref.unitIds.splice(0, ref.unitIds.length, ...ref.unitIds.filter((id) => id !== unitId));
  });
  const target = ownerKey ? corpusOwnerByKey(ownerKey, corpus) : null;
  if (target) {
    target.unitIds.push(unitId);
  }
}

function corpusIntegrityIssues(corpus = ensureCorpusDraft()) {
  if (!corpus) {
    return [];
  }
  const unitsById = new Map(corpus.units.map((unit) => [unit.id, unit]));
  const parentsByUnit = new Map();
  const issues = [];
  duplicateEntityIdGroups(corpusEntityIdRecords(corpus)).forEach(({ id, matches }) => {
    const types = [...new Set(matches.map(({ typeKey }) => t(typeKey)))].join(", ");
    issues.push(formatText("corpusDuplicateEntityId", { id, types }));
  });
  corpusParentRefs(corpus).forEach((ref) => {
    const parent = corpusParentLabel(ref);
    const seen = new Set();
    ref.unitIds.forEach((unitId) => {
      if (seen.has(unitId)) {
        const unit = unitsById.get(unitId);
        issues.push(formatText("corpusDuplicateLink", {
          parent,
          unit: corpusUnitLabel(unit, unitId),
        }));
        return;
      }
      seen.add(unitId);
      if (!unitsById.has(unitId)) {
        issues.push(formatText("corpusMissingUnit", { parent, unit: unitId }));
        return;
      }
      if (!parentsByUnit.has(unitId)) {
        parentsByUnit.set(unitId, []);
      }
      parentsByUnit.get(unitId).push(ref);
    });
  });
  parentsByUnit.forEach((parents, unitId) => {
    if (parents.length > 1) {
      issues.push(formatText("corpusMultipleParents", {
        unit: corpusUnitLabel(unitsById.get(unitId), unitId),
        parents: parents.map(corpusParentLabel).join("; "),
      }));
    }
  });
  return issues;
}

function corpusUnitLabel(unit, fallback = "") {
  const settings = normalizeDictionarySettings(activeDictionary()?.settings);
  const pattern = parseCorpusRenderPattern(settings.corpusUnitCardRenderPattern);
  let content = "";
  if (!pattern.error && pattern.groups.length) {
    const parsed = parseStrictCorpusGloss(unit?.content);
    if (!parsed.error && corpusGlossHasTargets(parsed.gloss, pattern.groups)) {
      content = pattern.groups
        .map((group) => group
          .filter((target) => corpusGlossTargetHasContent(parsed.gloss, target))
          .map((target) => corpusGlossText(parsed.gloss, target.key))
          .filter(Boolean)
          .join(" "))
        .filter(Boolean)
        .join(" / ");
    }
  } else if (!pattern.error) {
    content = String(unit?.content || "")
      .replaceAll("\\n", "\n")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" / ");
  }
  if (!content) {
    return fallback || t("corpusUnitFallback");
  }
  return content.length > 72 ? `${content.slice(0, 72)}...` : content;
}

function parseCorpusRenderPattern(value) {
  const source = String(value || "").trim();
  if (!source) {
    return { groups: [], error: "" };
  }
  const groups = [];
  for (const line of source.split(/\r?\n/)) {
    const compact = line.replace(/\s+/g, "");
    if (!compact) {
      continue;
    }
    const tokens = compact.match(/\(\\(?:gla|glb|glc|ft)\)|\\(?:gla|glb|glc|ft)/g) || [];
    if (!tokens.length || tokens.join("") !== compact) {
      return { groups: [], error: t("invalidCorpusRenderPattern") };
    }
    groups.push(tokens.map((token) => ({
      key: token.match(/\\(gla|glb|glc|ft)/)[1],
      optional: token.startsWith("("),
    })));
  }
  return { groups, error: "" };
}

function parseStrictCorpusGloss(value) {
  const gloss = { gla: [], glb: [], glc: [], ft: "" };
  const lines = String(value || "").replaceAll("\\n", "\n").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) {
    return { gloss, error: "" };
  }
  for (const line of lines) {
    const match = line.match(/^\\(gla|glb|glc|ft)\s*(.*)$/);
    if (!match) {
      return { gloss, error: t("corpusRenderError") };
    }
    if (match[1] === "ft") {
      gloss.ft = match[2].trim();
    } else {
      gloss[match[1]] = match[2].trim().split(/\s+/).filter(Boolean);
    }
  }
  return { gloss, error: "" };
}

function corpusGlossHasTargets(gloss, groups) {
  return groups.flat().every((target) => target.optional || corpusGlossTargetHasContent(gloss, target));
}

function corpusGlossTargetHasContent(gloss, target) {
  return target.key === "ft" ? Boolean(gloss.ft) : Boolean(gloss[target.key]?.length);
}

function corpusGlossText(gloss, key) {
  return key === "ft" ? gloss.ft : (gloss[key] || []).join(" ");
}

function corpusUnitRenderConfig(settings, context) {
  return context === "card"
    ? { pattern: settings.corpusUnitCardRenderPattern, align: settings.corpusUnitCardGlossAlign }
    : { pattern: settings.corpusUnitRenderPattern, align: settings.corpusUnitGlossAlign };
}

function renderCorpusUnitNameHtml(unit, context = "content") {
  const settings = normalizeDictionarySettings(activeDictionary()?.settings);
  const renderConfig = corpusUnitRenderConfig(settings, context);
  const pattern = parseCorpusRenderPattern(renderConfig.pattern);
  if (pattern.error) {
    return `<span class="corpus-unit-render-error" title="${escapeHtml(pattern.error)}">${escapeHtml(t("corpusRenderError"))}</span>`;
  }
  if (!pattern.groups.length) {
    const lines = String(unit?.content || "").replaceAll("\\n", "\n").split(/\r?\n/);
    const rendered = lines.map((line) => `<span>${line ? escapeHtml(line) : "&nbsp;"}</span>`).join("");
    return `<span class="corpus-unit-name corpus-unit-name-raw">${rendered || escapeHtml(t("corpusUnitFallback"))}</span>`;
  }
  const parsed = parseStrictCorpusGloss(unit?.content);
  if (parsed.error || !corpusGlossHasTargets(parsed.gloss, pattern.groups)) {
    return `<span class="corpus-unit-render-error" title="${escapeHtml(t("corpusRenderError"))}">${escapeHtml(t("corpusRenderError"))}</span>`;
  }
  return `
    <span class="corpus-unit-name corpus-unit-name-gloss">
      ${renderCorpusGlossRows(pattern.groups, parsed.gloss, settings, renderConfig.align)}
    </span>
  `;
}

function updateCorpusUnitNamePreview(unitId) {
  const corpus = ensureCorpusDraft();
  const unit = corpus?.units.find((item) => item.id === unitId);
  if (!unit) {
    return;
  }
  const contentRendered = renderCorpusUnitNameHtml(unit, "content");
  const cardRendered = renderCorpusUnitNameHtml(unit, "card");
  const form = elements.corpusEditor.querySelector('.corpus-form[data-corpus-kind="unit"]');
  if (form?.dataset.corpusId === unitId) {
    const heading = form.querySelector(".corpus-rendered-heading");
    if (heading) {
      heading.innerHTML = contentRendered;
    }
  }
  elements.corpusPanel.querySelectorAll("[data-corpus-unit-id], [data-linked-unit-id]").forEach((container) => {
    const linkedUnitId = container.dataset.corpusUnitId || container.dataset.linkedUnitId;
    if (linkedUnitId !== unitId) {
      return;
    }
    const host = container.querySelector(".corpus-unit-name-host");
    if (host) {
      host.innerHTML = cardRendered;
    }
  });
}

function scheduleCorpusUnitNamePreview(unitId) {
  if (corpusUnitPreviewFrame !== null) {
    cancelAnimationFrame(corpusUnitPreviewFrame);
  }
  corpusUnitPreviewFrame = requestAnimationFrame(() => {
    corpusUnitPreviewFrame = null;
    updateCorpusUnitNamePreview(unitId);
  });
}

function corpusGlossRowTokens(targets, gloss) {
  return targets.flatMap(({ key }) => {
    const values = key === "ft" ? gloss.ft.split(/\s+/).filter(Boolean) : gloss[key];
    return values.map((value) => ({ key, value }));
  });
}

function corpusGlossRowClasses(targets) {
  return targets.map(({ key }) => `gloss-${key}`).join(" ");
}

function renderCorpusGlossRows(groups, gloss, settings, alignEnabled) {
  const rows = groups
    .map((targets) => targets.filter((target) => corpusGlossTargetHasContent(gloss, target)))
    .filter((targets) => targets.length)
    .map((targets) => ({ targets, tokens: corpusGlossRowTokens(targets, gloss) }));
  if (!rows.length) {
    return escapeHtml(t("corpusUnitFallback"));
  }

  const output = [];
  let alignableRows = [];
  const flushAlignableRows = () => {
    if (alignableRows.length) {
      output.push(renderCorpusGlossRowGroup(alignableRows, alignEnabled, settings));
      alignableRows = [];
    }
  };
  rows.forEach((row) => {
    if (row.targets.some(({ key }) => key === "ft")) {
      flushAlignableRows();
      output.push(renderCorpusGlossRowGroup([row], false, settings));
    } else {
      alignableRows.push(row);
    }
  });
  flushAlignableRows();
  return output.join("");
}

function renderCorpusGlossRowGroup(rows, alignEnabled, settings) {
  const align = alignEnabled && rows.length > 1;
  if (!align) {
    return `
      <span class="corpus-gloss-group unaligned">
        ${rows.map(({ targets, tokens }) => `<span class="corpus-gloss-row ${corpusGlossRowClasses(targets)}">${tokens.map(({ key, value }) => renderCorpusGlossToken(key, value, settings)).join(" ")}</span>`).join("")}
      </span>
    `;
  }
  const columnCount = Math.max(...rows.map(({ tokens }) => tokens.length));
  return `
    <span class="corpus-gloss-group aligned">
      <table class="gloss-table"><tbody>
        ${rows.map(({ targets, tokens }) => `
          <tr class="gloss-row ${corpusGlossRowClasses(targets)}">
            ${Array.from({ length: columnCount }, (_, column) => {
              const token = tokens[column];
              return `<td class="gloss-cell">${token ? renderCorpusGlossToken(token.key, token.value, settings) : ""}</td>`;
            }).join("")}
          </tr>
        `).join("")}
      </tbody></table>
    </span>
  `;
}

function renderCorpusGlossToken(key, value, settings) {
  return `<span class="${glossStyleClassNames(key, settings)}">${renderGlossTokenText(key, value, settings)}</span>`;
}

function ensureCorpusSelection(corpus, viewState = activeCorpusViewState()) {
  if (!corpus.blocks.some((block) => block.id === viewState.selectedBlockId)) {
    viewState.selectedBlockId = corpus.blocks[0]?.id || "";
  }
  if (!corpus.units.some((unit) => unit.id === viewState.selectedUnitId)) {
    viewState.selectedUnitId = corpus.units[0]?.id || "";
  }
}

function renderCorpus(dictionary = activeDictionary()) {
  if (!elements.corpusPanel) {
    return;
  }
  syncCorpusEditorToDraft();
  if (!dictionary) {
    elements.corpusItemList.innerHTML = "";
    elements.corpusEditor.innerHTML = "";
    elements.corpusIntegrityPanel.hidden = true;
    return;
  }

  const corpus = ensureCorpusDraft(dictionary);
  const viewState = activeCorpusViewState();
  ensureCorpusSelection(corpus, viewState);
  elements.corpusPanel.classList.toggle("is-empty", viewState.mode === "blocks" ? !corpus.blocks.length : !corpus.units.length);
  elements.corpusEditor.dataset.dictionaryId = dictionary.id;
  elements.corpusSearchInput.value = viewState.query;
  elements.corpusModeControl.querySelectorAll("[data-corpus-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.corpusMode === viewState.mode);
  });
  elements.newCorpusItemButton.textContent = t(viewState.mode === "blocks" ? "newCorpusBlock" : "newCorpusUnit");
  renderCorpusIntegrity(corpus);
  renderCorpusItemList(corpus, viewState);
  renderCorpusEditor(corpus, viewState);
  if (normalizeDictionarySettings(dictionary.settings).corpusAutoSave && corpusFormIsDirty(dictionary)) {
    scheduleCorpusSave();
  }
}

function renderCorpusIntegrity(corpus) {
  const issues = corpusIntegrityIssues(corpus);
  elements.corpusIntegrityPanel.hidden = !issues.length;
  elements.corpusIntegrityList.innerHTML = issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("");
}

function renderCorpusItemList(corpus, viewState) {
  const query = normalize(viewState.query);
  if (viewState.mode === "blocks") {
    const blocks = corpus.blocks.filter((block) => {
      const text = [
        block.title,
        block.notes,
        ...block.tags,
        ...Object.entries(block.attributes).flat(),
        ...block.layers.flatMap((layer) => [layer.name, layer.speaker, layer.modality, layer.notes, ...layer.tags]),
      ].join(" ");
      return !query || normalize(text).includes(query);
    });
    if (!blocks.length) {
      const empty = document.createElement("p");
      empty.className = "corpus-empty-list";
      empty.textContent = t("noCorpusBlocks");
      renderVirtualListEmpty(elements.corpusItemList, corpusVirtualList, empty);
      return;
    }
    renderVirtualList(elements.corpusItemList, corpusVirtualList, blocks, {
      resetToken: corpusVirtualResetToken(viewState),
      getKey: (block) => `block:${block.id}`,
      getSizeCacheKey: (block) => corpusItemSizeCacheKey("block", block, viewState),
      renderItem: (block) => createCorpusBlockCard(block, viewState),
    });
    return;
  }

  const units = corpus.units.filter((unit) => {
    const text = [unit.content, unit.notes, ...unit.tags, ...Object.entries(unit.attributes).flat()].join(" ");
    return !query || normalize(text).includes(query);
  });
  if (!units.length) {
    const empty = document.createElement("p");
    empty.className = "corpus-empty-list";
    empty.textContent = t("noCorpusUnits");
    renderVirtualListEmpty(elements.corpusItemList, corpusVirtualList, empty);
    return;
  }
  renderVirtualList(elements.corpusItemList, corpusVirtualList, units, {
    resetToken: corpusVirtualResetToken(viewState),
    getKey: (unit) => `unit:${unit.id}`,
    getEstimatedHeight: () => 92,
    getSizeCacheKey: (unit) => corpusItemSizeCacheKey("unit", unit, viewState),
    renderItem: (unit) => createCorpusUnitCard(unit, corpus, viewState),
  });
}

function corpusVirtualResetToken(viewState) {
  return [state.activeDictionaryId, viewState.mode, normalize(viewState.query)].join("|");
}

function corpusItemSizeCacheKey(kind, item, viewState) {
  return [
    `corpus-${kind}`,
    state.activeDictionaryId,
    currentLanguage,
    normalize(viewState.query),
    viewState.mode,
    item.id,
    item.updatedAt,
    item.title,
    item.content,
    item.notes,
    (item.tags || []).join(","),
    stableJson(item.attributes || {}),
    kind === "block" ? stableJson((item.layers || []).map((layer) => ({
      id: layer.id,
      name: layer.name,
      speaker: layer.speaker,
      modality: layer.modality,
      notes: layer.notes,
      tags: layer.tags || [],
    }))) : "",
  ].map(virtualListSignaturePart).join("|");
}

function createCorpusBlockCard(block, viewState) {
  const button = document.createElement("button");
  const unitCount = block.unitIds.length + block.layers.reduce((sum, layer) => sum + layer.unitIds.length, 0);
  button.className = `corpus-item-card${block.id === viewState.selectedBlockId ? " selected" : ""}`;
  button.type = "button";
  button.dataset.corpusBlockId = block.id;
  button.innerHTML = `
    <strong>${escapeHtml(block.title || t("corpusBlockFallback"))}</strong>
    <span>${escapeHtml(formatText("corpusBlockStats", { layers: block.layers.length, units: unitCount }))}</span>
  `;
  return button;
}

function createCorpusUnitCard(unit, corpus, viewState) {
  const button = document.createElement("button");
  const parent = corpusParentsForUnit(unit.id, corpus)[0];
  button.className = `corpus-item-card${unit.id === viewState.selectedUnitId ? " selected" : ""}`;
  button.type = "button";
  button.dataset.corpusUnitId = unit.id;
  button.innerHTML = `
    <div class="corpus-unit-name-host">${renderCorpusUnitNameHtml(unit, "card")}</div>
    <span>${escapeHtml(formatText("corpusUnitParentLabel", { parent: corpusParentLabel(parent) }))}</span>
  `;
  return button;
}

function scheduleCorpusItemScroll(mode, itemId, behavior = "smooth") {
  if (!itemId) {
    return;
  }
  requestAnimationFrame(() => {
    scrollVirtualListItemIntoView(corpusVirtualList, `${mode === "blocks" ? "block" : "unit"}:${itemId}`, behavior);
  });
}

function renderCorpusEditor(corpus, viewState) {
  if (viewState.mode === "blocks") {
    const block = corpus.blocks.find((item) => item.id === viewState.selectedBlockId);
    elements.corpusEditor.innerHTML = block
      ? renderCorpusBlockEditor(block, corpus)
      : `<p class="corpus-empty-editor">${escapeHtml(t("noCorpusSelection"))}</p>`;
    return;
  }
  const unit = corpus.units.find((item) => item.id === viewState.selectedUnitId);
  elements.corpusEditor.innerHTML = unit
    ? renderCorpusUnitEditor(unit, corpus)
    : `<p class="corpus-empty-editor">${escapeHtml(t("noCorpusSelection"))}</p>`;
}

function renderCorpusAttributeEditor(attributes = {}) {
  const rows = Object.entries(attributes).map(([key, value]) => renderCorpusAttributeRow(key, value)).join("");
  return `
    <div class="corpus-attribute-editor" data-corpus-attributes>
      <div class="corpus-attribute-rows">${rows}</div>
      <button class="secondary-button" type="button" data-action="add-corpus-attribute">${escapeHtml(t("addAttribute"))}</button>
    </div>
  `;
}

function renderCorpusAttributeRow(key = "", value = "") {
  return `
    <div class="corpus-attribute-row">
      <input data-field="attribute-key" aria-label="${escapeHtml(t("attributeName"))}" placeholder="${escapeHtml(t("attributeName"))}" value="${escapeHtml(key)}">
      <input data-field="attribute-value" aria-label="${escapeHtml(t("attributeValue"))}" placeholder="${escapeHtml(t("attributeValue"))}" value="${escapeHtml(value)}">
      <button class="corpus-icon-button danger" type="button" data-action="remove-corpus-attribute" data-app-tooltip="always" aria-label="${escapeHtml(t("removeAttribute"))}">×</button>
    </div>
  `;
}

function collectCorpusAttributes(container) {
  if (!container) {
    return {};
  }
  const attributes = {};
  container.querySelectorAll(".corpus-attribute-row").forEach((row) => {
    const key = row.querySelector('[data-field="attribute-key"]')?.value.trim() || "";
    if (key) {
      attributes[key] = row.querySelector('[data-field="attribute-value"]')?.value || "";
    }
  });
  return attributes;
}

function renderCorpusBlockEditor(block, corpus) {
  return `
    <form class="corpus-form" data-corpus-kind="block" data-corpus-id="${escapeHtml(block.id)}" autocomplete="off">
      <div class="form-heading compact-heading">
        <div><p class="eyebrow">${escapeHtml(t("corpusBlock"))}</p><h3>${escapeHtml(block.title || t("corpusBlockFallback"))}</h3></div>
        <button class="danger-ghost" type="button" data-action="delete-corpus-block">${escapeHtml(t("deleteCorpusBlock"))}</button>
      </div>
      <label><span>${escapeHtml(t("corpusBlockTitle"))}</span><input data-field="title" maxlength="160" value="${escapeHtml(block.title)}"></label>
      <label><span>${escapeHtml(t("corpusTags"))}</span><input data-field="tags" value="${escapeHtml(block.tags.join("，"))}"><small class="field-help">${escapeHtml(t("corpusTagsHelp"))}</small></label>
      <label><span>${escapeHtml(t("corpusNotes"))}</span><textarea data-field="notes" rows="4">${escapeHtml(block.notes)}</textarea></label>
      <section class="corpus-subsection">
        <div class="subsection-title"><h3>${escapeHtml(t("corpusAttributes"))}</h3></div>
        ${renderCorpusAttributeEditor(block.attributes)}
      </section>
      <section class="corpus-subsection">
        <div class="subsection-title"><h3>${escapeHtml(t("directUnits"))}</h3></div>
        ${renderCorpusLinkedUnits(block.unitIds, `block:${block.id}`, corpus)}
      </section>
      <section class="corpus-subsection">
        <div class="form-heading compact-heading">
          <div><h3>${escapeHtml(t("corpusLayers"))}</h3></div>
          <button class="secondary-button" type="button" data-action="add-corpus-layer">${escapeHtml(t("addLayer"))}</button>
        </div>
        <div class="corpus-layer-list">
          ${block.layers.map((layer, index) => renderCorpusLayerEditor(block, layer, index, corpus)).join("")}
        </div>
      </section>
    </form>
  `;
}

function renderCorpusLayerEditor(block, layer, index, corpus) {
  return `
    <article class="corpus-layer-card" data-layer-id="${escapeHtml(layer.id)}">
      <div class="corpus-layer-header">
        <div><p class="eyebrow">${escapeHtml(t("corpusLayer"))} ${index + 1}</p><strong>${escapeHtml(layer.name || t("corpusLayerFallback"))}</strong></div>
        <div class="corpus-order-actions">
          <button class="corpus-icon-button" type="button" data-action="move-corpus-layer-up" data-app-tooltip="always" aria-label="${escapeHtml(t("moveUp"))}" ${index === 0 ? "disabled" : ""}>↑</button>
          <button class="corpus-icon-button" type="button" data-action="move-corpus-layer-down" data-app-tooltip="always" aria-label="${escapeHtml(t("moveDown"))}" ${index === block.layers.length - 1 ? "disabled" : ""}>↓</button>
          <button class="corpus-icon-button danger" type="button" data-action="delete-corpus-layer" data-app-tooltip="always" aria-label="${escapeHtml(t("deleteCorpusLayer"))}">×</button>
        </div>
      </div>
      <div class="form-grid">
        <label><span>${escapeHtml(t("layerName"))}</span><input data-field="name" value="${escapeHtml(layer.name)}"></label>
        <label><span>${escapeHtml(t("speaker"))}</span><input data-field="speaker" value="${escapeHtml(layer.speaker)}"></label>
        <label><span>${escapeHtml(t("modality"))}</span><input data-field="modality" value="${escapeHtml(layer.modality)}"></label>
        <label><span>${escapeHtml(t("corpusTags"))}</span><input data-field="tags" value="${escapeHtml(layer.tags.join("，"))}"></label>
      </div>
      <label><span>${escapeHtml(t("corpusNotes"))}</span><textarea data-field="notes" rows="3">${escapeHtml(layer.notes)}</textarea></label>
      <div class="subsection-title"><h3>${escapeHtml(t("corpusAttributes"))}</h3></div>
      ${renderCorpusAttributeEditor(layer.attributes)}
      <div class="subsection-title"><h3>${escapeHtml(t("linkedUnits"))}</h3></div>
      ${renderCorpusLinkedUnits(layer.unitIds, `layer:${block.id}:${layer.id}`, corpus)}
    </article>
  `;
}

function renderCorpusLinkedUnits(unitIds, ownerKey, corpus) {
  const unitsById = new Map(corpus.units.map((unit) => [unit.id, unit]));
  const linked = unitIds.map((unitId, index) => {
    const unit = unitsById.get(unitId);
    return `
      <li data-linked-unit-id="${escapeHtml(unitId)}">
        <div class="corpus-unit-name-host${unit ? "" : " missing"}">${unit ? renderCorpusUnitNameHtml(unit, "card") : escapeHtml(unitId)}</div>
        <div class="corpus-order-actions">
          <button class="corpus-icon-button" type="button" data-action="move-corpus-unit-up" data-app-tooltip="always" aria-label="${escapeHtml(t("moveUp"))}" ${index === 0 ? "disabled" : ""}>↑</button>
          <button class="corpus-icon-button" type="button" data-action="move-corpus-unit-down" data-app-tooltip="always" aria-label="${escapeHtml(t("moveDown"))}" ${index === unitIds.length - 1 ? "disabled" : ""}>↓</button>
          <button class="corpus-icon-button danger" type="button" data-action="unlink-corpus-unit" data-app-tooltip="always" aria-label="${escapeHtml(t("unlink"))}">×</button>
        </div>
      </li>
    `;
  }).join("");
  const availableUnits = corpus.units.filter((unit) => !unitIds.includes(unit.id));
  return `
    <div class="corpus-linked-units" data-corpus-owner="${escapeHtml(ownerKey)}">
      <ol>${linked}</ol>
      <div class="corpus-link-row">
        <select data-corpus-unit-link aria-label="${escapeHtml(t("chooseUnit"))}" ${availableUnits.length ? "" : "disabled"}>
          <option value="">${escapeHtml(t("chooseUnit"))}</option>
          ${availableUnits.map((unit) => `<option value="${escapeHtml(unit.id)}">${escapeHtml(corpusUnitLabel(unit))}</option>`).join("")}
        </select>
        <button class="secondary-button" type="button" data-action="link-corpus-unit" ${availableUnits.length ? "" : "disabled"}>${escapeHtml(t("linkUnit"))}</button>
      </div>
      <p class="field-help">${escapeHtml(t("corpusLinkMovesUnit"))}</p>
    </div>
  `;
}

function renderCorpusUnitEditor(unit, corpus) {
  const parents = corpusParentsForUnit(unit.id, corpus);
  const parent = parents[0] || null;
  return `
    <form class="corpus-form" data-corpus-kind="unit" data-corpus-id="${escapeHtml(unit.id)}" autocomplete="off">
      <div class="form-heading compact-heading">
        <div><p class="eyebrow">${escapeHtml(t("corpusUnit"))}</p><div class="corpus-rendered-heading">${renderCorpusUnitNameHtml(unit, "content")}</div></div>
        <button class="danger-ghost" type="button" data-action="delete-corpus-unit">${escapeHtml(t("deleteCorpusUnit"))}</button>
      </div>
      <label><span>${escapeHtml(t("corpusUnitContent"))}</span><textarea data-field="content" rows="6">${escapeHtml(unit.content)}</textarea></label>
      <label><span>${escapeHtml(t("corpusParent"))}</span>
        <select data-field="parent">
          <option value="">${escapeHtml(t("corpusOrphan"))}</option>
          ${corpusParentRefs(corpus).map((ref) => `<option value="${escapeHtml(ref.key)}"${parent?.key === ref.key ? " selected" : ""}>${escapeHtml(corpusParentLabel(ref))}</option>`).join("")}
        </select>
      </label>
      <label><span>${escapeHtml(t("corpusTags"))}</span><input data-field="tags" value="${escapeHtml(unit.tags.join("，"))}"><small class="field-help">${escapeHtml(t("corpusTagsHelp"))}</small></label>
      <label><span>${escapeHtml(t("corpusNotes"))}</span><textarea data-field="notes" rows="4">${escapeHtml(unit.notes)}</textarea></label>
      <section class="corpus-subsection">
        <div class="subsection-title"><h3>${escapeHtml(t("corpusAttributes"))}</h3></div>
        ${renderCorpusAttributeEditor(unit.attributes)}
      </section>
      <section class="corpus-subsection">
        <div class="subsection-title"><h3>${escapeHtml(t("effectiveAttributes"))}</h3></div>
        <p class="field-help">${escapeHtml(t("effectiveAttributesHelp"))}</p>
        ${renderCorpusEffectiveAttributes(unit, parent)}
      </section>
    </form>
  `;
}

function renderCorpusEffectiveAttributes(unit, parent) {
  const effective = new Map();
  const apply = (attributes, source) => {
    Object.entries(attributes || {}).forEach(([key, value]) => effective.set(key, { value, source }));
  };
  if (parent) {
    apply(parent.block.attributes, t("attributeSourceBlock"));
    if (parent.layer) {
      apply(parent.layer.attributes, t("attributeSourceLayer"));
    }
  }
  apply(unit.attributes, t("attributeSourceUnit"));
  if (!effective.size) {
    return `<p class="muted-text">${escapeHtml(t("noEffectiveAttributes"))}</p>`;
  }
  return `
    <div class="corpus-effective-table">
      ${[...effective.entries()].map(([key, detail]) => `
        <div><strong>${escapeHtml(key)}</strong><span>${escapeHtml(detail.value)}</span><small>${escapeHtml(detail.source)}</small></div>
      `).join("")}
    </div>
  `;
}

function updateCorpusRecord(record, changes) {
  const changed = Object.entries(changes).some(([key, value]) => stableJson(record[key]) !== stableJson(value));
  if (!changed) {
    return;
  }
  Object.assign(record, changes);
  if (Object.hasOwn(record, "updatedAt")) {
    record.updatedAt = new Date().toISOString();
  }
}

function syncCorpusEditorToDraft() {
  const form = elements.corpusEditor?.querySelector(".corpus-form");
  if (!form || !corpusDraftState || elements.corpusEditor.dataset.dictionaryId !== corpusDraftState.dictionaryId) {
    return;
  }
  const corpus = corpusDraftState.corpus;
  if (form.dataset.corpusKind === "block") {
    const block = corpus.blocks.find((item) => item.id === form.dataset.corpusId);
    if (!block) {
      return;
    }
    updateCorpusRecord(block, {
      title: form.querySelector('[data-field="title"]').value.trim(),
      tags: uniqueList(form.querySelector(':scope > label [data-field="tags"]').value),
      notes: form.querySelector(':scope > label [data-field="notes"]').value,
      attributes: collectCorpusAttributes(form.querySelector(':scope > .corpus-subsection [data-corpus-attributes]')),
    });
    form.querySelectorAll(".corpus-layer-card").forEach((card) => {
      const layer = block.layers.find((item) => item.id === card.dataset.layerId);
      if (!layer) {
        return;
      }
      updateCorpusRecord(layer, {
        name: card.querySelector('[data-field="name"]').value.trim(),
        speaker: card.querySelector('[data-field="speaker"]').value.trim(),
        modality: card.querySelector('[data-field="modality"]').value.trim(),
        tags: uniqueList(card.querySelector('[data-field="tags"]').value),
        notes: card.querySelector('[data-field="notes"]').value,
        attributes: collectCorpusAttributes(card.querySelector('[data-corpus-attributes]')),
      });
    });
    return;
  }
  const unit = corpus.units.find((item) => item.id === form.dataset.corpusId);
  if (!unit) {
    return;
  }
  updateCorpusRecord(unit, {
    content: form.querySelector('[data-field="content"]').value,
    tags: uniqueList(form.querySelector('[data-field="tags"]').value),
    notes: form.querySelector('[data-field="notes"]').value,
    attributes: collectCorpusAttributes(form.querySelector('[data-corpus-attributes]')),
  });
  moveCorpusUnitToParent(corpus, unit.id, form.querySelector('[data-field="parent"]').value);
}

function corpusFormIsDirty(dictionary = activeDictionary()) {
  if (!dictionary || corpusDraftState?.dictionaryId !== dictionary.id) {
    return false;
  }
  syncCorpusEditorToDraft();
  return stableJson(corpusDraftState.corpus) !== stableJson(normalizeCorpus(dictionary.corpus));
}

async function runCorpusSaveQueue() {
  let savedAny = false;
  while (corpusSaveRequested) {
    corpusSaveRequested = false;
    const dictionary = activeDictionary();
    if (!dictionary) {
      return savedAny;
    }
    syncCorpusEditorToDraft();
    const snapshot = cloneCorpus(ensureCorpusDraft(dictionary));
    const saved = await api(`/api/dictionaries/${encodeURIComponent(dictionary.id)}/corpus`, {
      method: "PUT",
      body: JSON.stringify(snapshot),
    });
    const normalized = applyDictionaryModulePayload(saved);
    savedAny = true;
    clearTimeout(corpusSaveTimer);
    corpusSaveTimer = null;

    // Input may have changed the live draft while this snapshot was being saved.
    if (
      corpusDraftState?.dictionaryId === normalized.id
      && stableJson(corpusDraftState.corpus) !== stableJson(normalized.corpus)
    ) {
      corpusSaveRequested = true;
    }
  }
  return savedAny;
}

function saveCorpus(showSavedToast = true) {
  const dictionary = activeDictionary();
  if (!dictionary) {
    showToast(t("createDictionaryFirstToast"));
    return Promise.resolve(false);
  }
  syncCorpusEditorToDraft();
  ensureCorpusDraft(dictionary);
  clearTimeout(corpusSaveTimer);
  corpusSaveTimer = null;
  if (!corpusFormIsDirty(dictionary)) {
    if (showSavedToast) {
      showToast(t("noChangesToSave"));
    }
    return Promise.resolve(true);
  }
  corpusSaveRequested = true;
  if (!corpusSavePromise) {
    corpusSavePromise = runCorpusSaveQueue().finally(() => {
      corpusSavePromise = null;
    });
  }
  const pendingSave = corpusSavePromise;
  if (!showSavedToast) {
    return pendingSave;
  }
  return pendingSave.then((saved) => {
    if (saved) {
      showToast(t("corpusSaved"));
    }
    return saved;
  }).catch((error) => {
    showApiErrorToast(error, "saveFailed");
    return false;
  });
}

function scheduleCorpusSave() {
  clearTimeout(corpusSaveTimer);
  const dictionary = activeDictionary();
  if (!dictionary || !normalizeDictionarySettings(dictionary.settings).corpusAutoSave || !corpusFormIsDirty(dictionary)) {
    return;
  }
  corpusSaveTimer = setTimeout(() => {
    saveCorpus(false).catch((error) => console.error(error));
  }, 700);
}

function addCorpusBlock() {
  const dictionary = activeDictionary();
  const corpus = ensureCorpusDraft(dictionary);
  if (!corpus) {
    return;
  }
  syncCorpusEditorToDraft();
  const block = normalizeCorpusBlock({
    id: uniqueDictionaryEntityId("corpus-block", { ...dictionary, corpus }),
    title: "",
  });
  corpus.blocks.push(block);
  const viewState = activeCorpusViewState();
  viewState.mode = "blocks";
  viewState.selectedBlockId = block.id;
  renderCorpus(dictionary);
  scheduleCorpusItemScroll("blocks", block.id);
  elements.corpusEditor.querySelector('[data-field="title"]')?.focus();
}

function addCorpusUnit() {
  const dictionary = activeDictionary();
  const corpus = ensureCorpusDraft(dictionary);
  if (!corpus) {
    return;
  }
  syncCorpusEditorToDraft();
  const unit = normalizeCorpusUnit({
    id: uniqueDictionaryEntityId("corpus-unit", { ...dictionary, corpus }),
    content: "",
  });
  corpus.units.push(unit);
  const viewState = activeCorpusViewState();
  viewState.mode = "units";
  viewState.selectedUnitId = unit.id;
  renderCorpus(dictionary);
  scheduleCorpusItemScroll("units", unit.id);
  elements.corpusEditor.querySelector('[data-field="content"]')?.focus();
}

function moveArrayItem(items, index, offset) {
  const nextIndex = index + offset;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) {
    return;
  }
  const [item] = items.splice(index, 1);
  items.splice(nextIndex, 0, item);
}

function fillMorphologyFunctionsForm(dictionary) {
  const functions = morphologyFunctionConfig(dictionary);
  elements.morphologyLeftVObjectsInput.value = functions.leftV.join("，");
  elements.morphologyRightVObjectsInput.value = functions.rightV.join("，");
}

function renderMorphologyTablesConfig(dictionary) {
  if (!elements.morphologyTableList) {
    return;
  }
  elements.morphologyTableList.innerHTML = "";
  if (!dictionary) {
    return;
  }
  const groups = normalizeMorphology(dictionary.morphology).templateGroups;
  groups.forEach((group, index) => elements.morphologyTableList.append(createMorphologyGroupEditor(group, index)));
}

function createMorphologyGroupEditor(group, index) {
  const card = document.createElement("section");
  card.className = "morphology-group-card";
  card.dataset.templateGroupId = group.id;
  card.dataset.groupName = group.name;
  card.dataset.groupNotes = group.notes || "";
  card.dataset.groupCreatedAt = group.createdAt || "";
  card.dataset.groupUpdatedAt = group.updatedAt || "";
  card.innerHTML = `
    <div class="morphology-group-config-grid">
      <div class="morphology-group-primary-fields">
        <div class="morphology-group-header">
          <div class="morphology-group-title-row">
            <button class="morphology-drag-handle" type="button" draggable="true" data-action="drag-morphology-group" aria-label="${escapeHtml(t("dragMorphologyTableGroup"))}">⋮⋮</button>
            <div>
              <p class="eyebrow">${escapeHtml(t("morphologyTableGroup"))} ${index + 1}</p>
              <input data-field="name" value="${escapeHtml(group.name)}" aria-label="${escapeHtml(t("morphologyTableGroupName"))}">
            </div>
          </div>
        </div>
        <div class="morphology-group-fields">
          <label>
            <span>${escapeHtml(t("autoMatchTags"))}</span>
            <input data-field="matchTags" value="${escapeHtml(group.matchTags.join("，"))}">
          </label>
        </div>
      </div>
      <label class="morphology-group-notes-field">
        <span>${escapeHtml(t("morphologyTableGroupNotes"))}</span>
        <textarea data-field="notes" rows="3">${escapeHtml(group.notes || "")}</textarea>
      </label>
      <div class="morphology-group-delete-action">
        <button class="danger-ghost" type="button" data-action="remove-morphology-group">${escapeHtml(t("removeMorphologyTableGroup"))}</button>
      </div>
    </div>
    <div class="morphology-group-table-toolbar">
      <span>${escapeHtml(t("morphologyTables"))}</span>
      <button class="primary-button" type="button" data-action="add-morphology-table">${escapeHtml(t("addMorphologyTable"))}</button>
    </div>
    <div class="morphology-group-table-list"></div>
  `;
  const tableList = card.querySelector(".morphology-group-table-list");
  if (group.tables.length) {
    group.tables.forEach((table) => tableList.append(createMorphologyTableEditor(table)));
  } else {
    tableList.append(emptyState(t("morphologyTable"), t("emptyMorphologyTableGroup")));
  }
  return card;
}

function createMorphologyTableEditor(table) {
  const card = document.createElement("article");
  card.className = "morphology-config-card";
  card.dataset.templateTableId = table.id;
  card.dataset.tableCreatedAt = table.createdAt || "";
  card.dataset.tableUpdatedAt = table.updatedAt || "";
  const expanded = expandedMorphologyTables.has(table.id);
  card.classList.toggle("is-collapsed", !expanded);
  card.innerHTML = `
    <div class="morphology-card-header">
      <div class="morphology-table-title-row">
        <button class="morphology-drag-handle" type="button" draggable="true" data-action="drag-morphology-table" aria-label="${escapeHtml(t("dragMorphologyTable"))}">⋮⋮</button>
        <div>
          <div class="morphology-card-title-row">
            <input data-field="title" value="${escapeHtml(table.title)}" aria-label="${escapeHtml(t("tableName"))}">
            <button class="morphology-table-toggle${expanded ? " is-expanded" : ""}" type="button" data-action="toggle-morphology-table" data-app-tooltip="always" aria-expanded="${expanded}" aria-label="${escapeHtml(expanded ? t("collapse") : t("expand"))}">
              <svg class="morphology-table-toggle-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"></path></svg>
            </button>
          </div>
        </div>
      </div>
      <div class="panel-actions">
        <button class="danger-ghost" type="button" data-action="remove-morphology-table">${escapeHtml(t("removeTable"))}</button>
      </div>
    </div>
    <div class="morphology-card-body" ${expanded ? "" : "hidden"}>
      <div class="form-grid">
        <label><span>${escapeHtml(t("rowCount"))}</span><input data-field="rows" type="number" min="1" value="${table.rowCount}"></label>
        <label><span>${escapeHtml(t("columnCount"))}</span><input data-field="cols" type="number" min="1" value="${table.columnCount}"></label>
      </div>
      <button class="secondary-button" type="button" data-action="resize-morphology-table">${escapeHtml(t("applySize"))}</button>
      <div class="morphology-edit-scroll">${renderMorphologyRuleInputs(table)}</div>
    </div>
  `;
  return card;
}

function renderMorphologyRuleInputs(table) {
  const header = `
    <thead>
      <tr>
        <th></th>
        ${table.columnLabels.map((label, col) => `
          <th><input data-col-label="${col}" value="${escapeHtml(label)}" aria-label="${escapeHtml(t("columnLabels"))} ${col + 1}"></th>
        `).join("")}
      </tr>
    </thead>
  `;
  const rows = [];
  for (let row = 0; row < table.rowCount; row += 1) {
    const cells = [];
    for (let col = 0; col < table.columnCount; col += 1) {
      const key = morphologyCellKey(row, col);
      const cell = table.cells[key] || normalizeMorphologyCell();
      cells.push(`
        <td class="morphology-rule-cell" data-cell="${escapeHtml(key)}">
          <textarea data-field="value" rows="2">${escapeHtml(cell.sourceText)}</textarea>
        </td>
      `);
    }
    rows.push(`
      <tr>
        <th><input data-row-label="${row}" value="${escapeHtml(table.rowLabels[row])}" aria-label="${escapeHtml(t("rowLabels"))} ${row + 1}"></th>
        ${cells.join("")}
      </tr>
    `);
  }
  return `<table class="morphology-edit-table">${header}<tbody>${rows.join("")}</tbody></table>`;
}

function collectMorphologyTemplateGroups() {
  const groups = [...elements.morphologyTableList.querySelectorAll(".morphology-group-card")].map((groupCard) => ({
    id: groupCard.dataset.templateGroupId,
    name: groupCard.querySelector('[data-field="name"]')?.value.trim() || groupCard.dataset.groupName || t("morphologyTableGroup"),
    matchTags: splitList(groupCard.querySelector('[data-field="matchTags"]')?.value),
    notes: groupCard.querySelector('[data-field="notes"]')?.value || groupCard.dataset.groupNotes || "",
    createdAt: groupCard.dataset.groupCreatedAt || "",
    updatedAt: groupCard.dataset.groupUpdatedAt || "",
    tables: [...groupCard.querySelectorAll(".morphology-config-card")].map((tableCard) => {
      const rowCount = Math.max(1, Number.parseInt(tableCard.querySelector('[data-field="rows"]').value, 10) || 1);
      const columnCount = Math.max(1, Number.parseInt(tableCard.querySelector('[data-field="cols"]').value, 10) || 1);
      const rowLabels = Array.from({ length: rowCount }, (_, index) => tableCard.querySelector(`[data-row-label="${index}"]`)?.value.trim() || `${index + 1}`);
      const columnLabels = Array.from({ length: columnCount }, (_, index) => tableCard.querySelector(`[data-col-label="${index}"]`)?.value.trim() || `${index + 1}`);
      const cells = {};
      tableCard.querySelectorAll(".morphology-rule-cell").forEach((cellNode) => {
        cells[cellNode.dataset.cell] = { sourceText: cellNode.querySelector('[data-field="value"]').value };
      });
      return {
        id: tableCard.dataset.templateTableId,
        title: tableCard.querySelector('[data-field="title"]').value.trim(),
        rowCount,
        columnCount,
        rowLabels,
        columnLabels,
        cells,
        createdAt: tableCard.dataset.tableCreatedAt || "",
        updatedAt: tableCard.dataset.tableUpdatedAt || "",
      };
    }),
  }));
  return normalizeMorphology({ templateGroups: groups }).templateGroups;
}

function newMorphologyTableGroup(position) {
  return normalizeMorphology({
    templateGroups: [{
      id: uid("morph"),
      name: `${t("morphologyTableGroup")} ${position + 1}`,
      matchTags: [],
      tables: [],
    }],
  }).templateGroups[0];
}

function newMorphologyTemplateTable(position) {
  return normalizeMorphology({
    templateGroups: [{
      id: "morph-editor-preview",
      tables: [{
        id: uid("mtable"),
        title: `${t("morphologyTable")} ${position + 1}`,
        rowCount: 2,
        columnCount: 2,
      }],
    }],
  }).templateGroups[0].tables[0];
}

function applyMorphologyTableSizeChanges() {
  renderMorphologyTablesConfig({ morphology: morphologyTablesFormSnapshot() });
}

function collectMorphologyFunctions() {
  return normalizeMorphologyFunctions({
    leftV: elements.morphologyLeftVObjectsInput.value,
    rightV: elements.morphologyRightVObjectsInput.value,
  });
}

function validateMorphologyFunctionUsage(morphology) {
  return morphologyModel.validateMorphologyFunctionUsage(morphology);
}

function validateMorphologyReferenceSyntax(morphology) {
  return morphologyModel.validateMorphologyReferenceSyntax(morphology, { labelForCell: morphologyCellErrorLabel });
}

function extractMorphologyReferences(value) {
  return morphologyModel.extractMorphologyReferences(value);
}

function morphologyCellErrorLabel(table, key) {
  return morphologyModel.morphologyCellErrorLabel(table, key);
}

function extractMorphologyFunctionCalls(rule) {
  return morphologyModel.extractMorphologyFunctionCalls(rule);
}

async function saveMorphologyFunctions(event) {
  event.preventDefault();
  const dictionary = activeDictionary();
  if (!dictionary) {
    showToast(t("createDictionaryFirstToast"));
    return false;
  }
  if (!morphologyFunctionsFormIsDirty()) {
    showToast(t("noChangesToSave"));
    return true;
  }
  const morphology = normalizeMorphology({
    ...dictionary.morphology,
    functions: collectMorphologyFunctions(),
  });
  const functionErrors = validateMorphologyFunctionUsage(morphology);
  if (functionErrors.length) {
    await appConfirm(functionErrors.join("\n"), {
      title: t("invalidMorphologyFunctionObjects"),
      alert: true,
    });
    return false;
  }
  try {
    const saved = await api(`/api/dictionaries/${encodeURIComponent(dictionary.id)}/morphology`, {
      method: "PUT",
      body: JSON.stringify(morphology),
    });
    applyDictionaryModulePayload(saved);
    resetEntryReadStateAfterSave();
    render();
    showToast(t("dictionarySaved"));
    return true;
  } catch (error) {
    showApiErrorToast(error, "dictionarySaveFailed");
    return false;
  }
}

async function saveMorphologyTables(event) {
  event.preventDefault();
  const dictionary = activeDictionary();
  if (!dictionary) {
    showToast(t("createDictionaryFirstToast"));
    return false;
  }
  if (!morphologyTablesFormIsDirty()) {
    showToast(t("noChangesToSave"));
    return true;
  }
  const morphology = normalizeMorphology({
    functions: morphologyFunctionConfig(dictionary),
    templateGroups: collectMorphologyTemplateGroups(),
  });
  const syntaxErrors = validateMorphologyReferenceSyntax(morphology);
  if (syntaxErrors.length) {
    await appConfirm(syntaxErrors.join("\n"), {
      title: t("invalidMorphologySyntax"),
      alert: true,
    });
    return false;
  }
  try {
    const saved = await api(`/api/dictionaries/${encodeURIComponent(dictionary.id)}/morphology`, {
      method: "PUT",
      body: JSON.stringify(morphology),
    });
    applyDictionaryModulePayload(saved);
    resetEntryReadStateAfterSave();
    render();
    showToast(t("dictionarySaved"));
    return true;
  } catch (error) {
    showApiErrorToast(error, "dictionarySaveFailed");
    return false;
  }
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let list = [];
  let inCode = false;
  let codeLines = [];

  const flushParagraph = () => {
    if (!paragraph.length) {
      return;
    }
    html.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) {
      return;
    }
    html.push(`<ul>${list.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ul>`);
    list = [];
  };

  lines.forEach((line) => {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        flushParagraph();
        flushList();
        inCode = true;
      }
      return;
    }

    if (inCode) {
      codeLines.push(line);
      return;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      return;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      return;
    }

    const listItem = line.match(/^\s*[-*]\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      list.push(listItem[1]);
      return;
    }

    const quote = line.match(/^\s*>\s+(.+)$/);
    if (quote) {
      flushParagraph();
      flushList();
      html.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
      return;
    }

    flushList();
    paragraph.push(line.trim());
  });

  if (inCode) {
    html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }
  flushParagraph();
  flushList();
  return html.join("") || `<p class="muted-text">${escapeHtml(t("docsNeedDictionary"))}</p>`;
}

function renderInlineMarkdown(value) {
  let text = escapeHtml(value);
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return text;
}

function parseIpaDefaultStressInput() {
  const value = elements.ipaDefaultStressInput.value.trim();
  if (!/^[+-]?\d+$/.test(value)) {
    return null;
  }
  return Number.parseInt(value, 10);
}

async function saveIpaSettings(event, options = {}) {
  event.preventDefault();
  const dictionary = activeDictionary();
  if (!dictionary) {
    showToast(t("createDictionaryFirstToast"));
    return false;
  }

  const defaultStress = parseIpaDefaultStressInput();
  if (!Number.isInteger(defaultStress)) {
    showToast(t("ipaDefaultStressInvalid"));
    elements.ipaDefaultStressInput.focus();
    return false;
  }

  if (!ipaFormIsDirty()) {
    if (options.showToast !== false) {
      showToast(t("noChangesToSave"));
    }
    return true;
  }

  const ipa = ipaSettingsFromForm();
  try {
    const saved = await api(`/api/dictionaries/${encodeURIComponent(dictionary.id)}/settings/ipa`, {
      method: "PUT",
      body: JSON.stringify(ipa),
    });
    applyDictionaryModulePayload(saved);
    resetEntryReadStateAfterSave();
    render();
    if (options.showToast !== false) {
      showToast(t("ipaSaved"));
    }
    return true;
  } catch (error) {
    showApiErrorToast(error, "dictionarySaveFailed");
    return false;
  }
}

function generateIpaFromLemma(lemma, ipaSettings = activeDictionary()?.settings?.ipa) {
  return ipaModel.generateIpaFromLemma(lemma, ipaSettings);
}

function ipaSettingsFromForm() {
  const defaultStress = parseIpaDefaultStressInput();
  return normalizeIpaSettings({
    mappings: collectIpaRuleList(elements.ipaMappingList),
    syllable: {
      vowels: elements.ipaVowelsInput.value.trim() || "aeiouAEIOU",
      separator: elements.ipaSyllableSeparatorInput.value.trim() || ".",
      onsetClusters: normalizeClusterList(elements.ipaOnsetClustersInput.value),
      codaClusters: normalizeClusterList(elements.ipaCodaClustersInput.value),
      complexPhonemes: normalizeClusterList(elements.ipaComplexPhonemesInput.value),
    },
    defaultStress: Number.isInteger(defaultStress) ? defaultStress : -2,
    unstressMonosyllables: elements.ipaUnstressMonosyllablesInput.checked,
  });
}

function ipaPipelinePreview(source, ipa = ipaSettingsFromForm()) {
  return ipaModel.ipaPipelinePreview(source, ipa);
}

function displayIpaStage(value) {
  return ipaModel.displayIpaStage(value);
}

function renderIpaSandbox() {
  if (!elements.ipaSandboxInput) {
    return;
  }
  const preview = ipaPipelinePreview(elements.ipaSandboxInput.value);
  elements.ipaSandboxMapped.textContent = preview.mapped || "—";
  elements.ipaSandboxSyllables.textContent = preview.syllables || "—";
  elements.ipaSandboxFinal.textContent = preview.final || "—";
}

function applyIpaMappings(source, ipa) {
  return ipaModel.applyIpaMappings(source, ipa);
}

function ruleMatchesAt(source, index, rule) {
  return ipaModel.ruleMatchesAt(source, index, rule);
}

function conditionMatches(value, condition, matchEnd) {
  return ipaModel.conditionMatches(value, condition, matchEnd);
}

function splitIntoSyllables(value, syllableSettings = {}) {
  return ipaModel.splitIntoSyllables(value, syllableSettings);
}

function tokenizePhonemeUnits(value, complexPhonemes = []) {
  return ipaModel.tokenizePhonemeUnits(value, complexPhonemes);
}

function matchingCodaCluster(between, syllableSettings = {}) {
  return ipaModel.matchingCodaCluster(between, syllableSettings);
}

function matchingOnsetCluster(between, syllableSettings = {}) {
  return ipaModel.matchingOnsetCluster(between, syllableSettings);
}

function middleTokenBreak(start, between, complexPhonemes = []) {
  return ipaModel.middleTokenBreak(start, between, complexPhonemes);
}

function syllabifyIpaOutput(value, syllableSettings = {}) {
  return ipaModel.syllabifyIpaOutput(value, syllableSettings);
}

function defaultStressIndex(length, defaultStress) {
  return ipaModel.defaultStressIndex(length, defaultStress);
}

function resolveIpaStressIndex(syllables, explicitStressIndex, ipa = normalizeIpaSettings()) {
  return ipaModel.resolveIpaStressIndex(syllables, explicitStressIndex, ipa);
}

function applyAutoIpa(targetInput = elements.pronunciationInput, lemmaInput = elements.lemmaInput) {
  const lemma = lemmaInput.value.trim();
  if (!lemma) {
    showToast(t("ipaNeedsLemma"));
    return;
  }
  targetInput.value = generateIpaFromLemma(lemma);
  showToast(t("ipaGenerated"));
}

async function batchGenerateIpa(mode) {
  let dictionary = activeDictionary();
  if (!dictionary) {
    showToast(t("createDictionaryFirstToast"));
    return;
  }
  const defaultStress = parseIpaDefaultStressInput();
  if (!Number.isInteger(defaultStress)) {
    showToast(t("ipaDefaultStressInvalid"));
    elements.ipaDefaultStressInput.focus();
    return;
  }
  if (ipaFormIsDirty()) {
    const shouldSave = await appConfirm(t("batchIpaUnsavedSettingsConfirm"), {
      title: t("autoIpa"),
      confirmText: t("saveAndGenerate"),
      cancelText: t("cancel"),
    });
    if (!shouldSave) {
      return;
    }
    const saved = await saveIpaSettings({ preventDefault() {} }, { showToast: false });
    if (!saved) {
      return;
    }
    dictionary = activeDictionary();
  }
  const ipaSettings = dictionary.settings?.ipa;
  const overwrite = mode === "all";
  const targets = dictionary.entries.filter((entry) => entry.lemma && (overwrite || !entry.pronunciation));
  if (!targets.length) {
    showToast(overwrite ? `${t("batchIpaUpdated")} 0` : t("batchIpaNoMissing"));
    return;
  }
  const confirmed = await appConfirm(overwrite ? t("batchIpaAllConfirm") : t("batchIpaMissingConfirm"), {
    danger: overwrite,
  });
  if (!confirmed) {
    return;
  }
  const updates = targets.map((entry) => ({
    id: entry.id,
    patch: { pronunciation: generateIpaFromLemma(entry.lemma, ipaSettings) },
  }));
  try {
    const saved = await api(`/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries`, {
      method: "PATCH",
      body: JSON.stringify({ updates }),
    });
    applyEntryPatchPayload(saved);
    resetEntryReadStateAfterSave();
    render();
    showToast(`${t("batchIpaUpdated")} ${targets.length}`);
  } catch (error) {
    showApiErrorToast(error, "saveFailed");
  }
}

function emptyState(title, body) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span>`;
  return empty;
}

async function openPartialEdit(section) {
  if (partialEditForm() && !(await closePendingEditsForPageSwitch())) {
    return false;
  }
  const entry = selectedEntry();
  if (!entry || editorMode === "edit") {
    return false;
  }

  cancelPartialEdit();
  const host = elements.entryDisplay.querySelector(`[data-edit-section="${section}"]`);
  if (!host) {
    return;
  }

  partialEditSection = section;
  partialEditHost = host;
  host.classList.add("partial-editing");

  const form = document.createElement("form");
  form.className = "inline-partial-edit-form";
  form.autocomplete = "off";
  form.noValidate = true;
  form.innerHTML = `
    <div class="form-heading compact-heading">
      <div>
        <p class="eyebrow">${escapeHtml(t("partialEdit"))}</p>
        <h3>${escapeHtml(partialEditTitle(section))}</h3>
      </div>
      <button class="secondary-button" type="button" data-action="cancel-partial-edit">${escapeHtml(t("cancel"))}</button>
    </div>
    <div class="partial-edit-body"></div>
    <div class="form-actions">
      <button class="primary-button" type="submit">${escapeHtml(t("save"))}</button>
    </div>
  `;
  host.append(form);
  const body = partialEditBody();

  if (section === "basic") {
    body.innerHTML = `
      <label>
        <span>${escapeHtml(t("lemma"))}</span>
        <input data-field="lemma" aria-required="true" maxlength="80" value="${escapeHtml(entry.lemma)}">
      </label>
      <label>
        <span>${escapeHtml(t("pronunciation"))}</span>
        <div class="inline-field-action">
          <textarea class="ipa-single-line" rows="1" data-field="pronunciation" maxlength="120">${escapeHtml(entry.pronunciation)}</textarea>
          <button class="secondary-button" type="button" data-action="partial-auto-ipa">${escapeHtml(t("autoIpa"))}</button>
        </div>
      </label>
      <div class="ipa-keyboard partial-ipa-keyboard"></div>
      <label>
        <span>${escapeHtml(t("tagsLabel"))}</span>
        <input data-field="tags" maxlength="180" value="${escapeHtml((entry.tags || []).join("，"))}">
      </label>
    `;
    renderPartialIpaKeyboard();
  } else if (section === "definitions") {
    const list = document.createElement("div");
    list.className = "definition-form-list";
    list.dataset.partialDefinitions = "true";
    body.append(list);
    renderPartialDefinitionList(entry.definitions);
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "secondary-button additive-button";
    addButton.dataset.action = "add-partial-definition";
    addButton.textContent = t("addDefinition");
    body.append(addButton);
  } else if (section === "etymology") {
    body.innerHTML = `
      <label>
        <span>${escapeHtml(t("sourceEntry"))}</span>
        <input data-field="sources" maxlength="220" value="${escapeHtml((entry.etymology?.sources || []).join("，"))}">
        <div class="source-suggestions" data-source-suggestions hidden></div>
      </label>
      <label>
        <span>${escapeHtml(t("etymologyDescription"))}</span>
        <textarea data-field="description" rows="4">${escapeHtml(entry.etymology?.description || "")}</textarea>
      </label>
    `;
    bindSourceAutocompleteInput(body.querySelector('[data-field="sources"]'));
  } else if (section === "notes") {
    body.innerHTML = `
      <label>
        <span>${escapeHtml(t("entryNotes"))}</span>
        <textarea data-field="notes" rows="6">${escapeHtml(entry.notes || "")}</textarea>
      </label>
    `;
  } else if (section === "morphology") {
    body.innerHTML = `
      <div class="partial-morphology-controls"></div>
    `;
    renderPartialMorphologyControls(entry);
  } else {
    cancelPartialEdit();
    return;
  }

  body.querySelector("input, textarea")?.focus();
  return true;
}

function partialEditTitle(section) {
  const titles = {
    basic: t("entry"),
    definitions: t("definitions"),
    etymology: t("etymology"),
    morphology: t("morphologyDisplay"),
    notes: t("entryNotes"),
  };
  return titles[section] || t("partialEdit");
}

function renderPartialDefinitionList(definitions = []) {
  const list = partialEditBody()?.querySelector('[data-partial-definitions="true"]');
  if (!list) {
    return;
  }
  list.innerHTML = "";
  definitionEditorItems(definitions).forEach((definition, index) => {
    const card = document.createElement("article");
    card.className = "definition-form-card";
    card.dataset.definitionId = definition.id || uid("def");
    card.innerHTML = definitionFormCardHtml(definition, index, "remove-partial-definition");
    list.append(card);
  });

  updatePartialRemoveDefinitionButtons(list);
}

function updatePartialRemoveDefinitionButtons(list = partialEditBody()?.querySelector('[data-partial-definitions="true"]')) {
  const cards = list?.querySelectorAll(".definition-form-card") || [];
  cards.forEach((card) => {
    card.querySelector('[data-action="remove-partial-definition"]').hidden = cards.length <= 1;
  });
}

function joinEntryRequirementMessages(messages) {
  return messages.join(currentLanguage === "en" ? " · " : "；");
}

function entrySaveRequirementMessage(entry, dictionary = activeDictionary()) {
  return joinEntryRequirementMessages([
    ...entryBasicRequirementMessages(entry, dictionary),
    ...entryDefinitionsRequirementMessages(entry, dictionary),
  ]);
}

function entryBasicRequirementMessages(entry, dictionary = activeDictionary()) {
  const settings = normalizeDictionarySettings(dictionary?.settings);
  const messages = [];
  if (!entry.lemma?.trim()) {
    messages.push(t("requiredEntry"));
  }
  if (!settings.allowEmptyPronunciation && !entry.pronunciation?.trim()) {
    messages.push(t("requiredPronunciation"));
  }
  if (!settings.allowEmptyTags && !(entry.tags || []).length) {
    messages.push(t("requiredTags"));
  }
  return messages;
}

function entryDefinitionsRequirementMessages(entry, dictionary = activeDictionary()) {
  const settings = normalizeDictionarySettings(dictionary?.settings);
  const messages = [];
  if (!settings.allowEmptyDefinitions && !(entry.definitions || []).some((definition) => definition.meaning)) {
    messages.push(t("requiredDefinition"));
  }
  return messages;
}

function entryBasicRequirementMessage(entry, dictionary = activeDictionary()) {
  return joinEntryRequirementMessages(entryBasicRequirementMessages(entry, dictionary));
}

function entryDefinitionsRequirementMessage(entry, dictionary = activeDictionary()) {
  return joinEntryRequirementMessages(entryDefinitionsRequirementMessages(entry, dictionary));
}

function entryApiPayload(entry = {}) {
  const { morphology: _editorMorphology, ...payload } = entry;
  return payload;
}

function collectPartialDefinitions() {
  const list = partialEditBody()?.querySelector('[data-partial-definitions="true"]');
  return definitionFormStates(list)
    .map(({ id, meaning, example, note }) => ({ id, meaning, example, note }))
    .filter((definition) => definition.meaning || definition.example || definition.note);
}

function partialEntryFormCandidate(entry = selectedEntry(), body = partialEditBody()) {
  if (!entry || !body) {
    return null;
  }
  if (partialEditSection === "basic") {
    return {
      ...entry,
      lemma: body.querySelector('[data-field="lemma"]').value.trim(),
      pronunciation: body.querySelector('[data-field="pronunciation"]').value.trim(),
      tags: splitList(body.querySelector('[data-field="tags"]').value),
    };
  }
  if (partialEditSection === "definitions") {
    return { ...entry, definitions: collectPartialDefinitions() };
  }
  if (partialEditSection === "etymology") {
    return {
      ...entry,
      etymology: {
        sources: splitSourceText(body.querySelector('[data-field="sources"]').value),
        description: body.querySelector('[data-field="description"]').value.trim(),
      },
    };
  }
  if (partialEditSection === "notes") {
    return { ...entry, notes: body.querySelector('[data-field="notes"]').value.trim() };
  }
  if (partialEditSection === "morphology") {
    const morphologyState = collectMorphologyEntryState(body.querySelector(".partial-morphology-controls"), entry);
    return {
      ...entry,
      morphologyMode: morphologyState.morphologyMode,
      morphologyGroups: morphologyState.morphologyGroups,
    };
  }
  return { ...entry };
}

function partialEntryFormIsDirty() {
  const entry = selectedEntry();
  const candidate = partialEntryFormCandidate(entry);
  return Boolean(entry && candidate && !entriesHaveSameSemantics(candidate, entry));
}

async function savePartialEdit(event) {
  event.preventDefault();
  const dictionary = activeDictionary();
  const entry = selectedEntry();
  const body = partialEditBody();
  if (!dictionary || !entry || !body) {
    return false;
  }

  const previousLemma = entry.lemma || "";
  const nextEntry = partialEntryFormCandidate(entry, body);
  if (!nextEntry) {
    return false;
  }

  if (partialEditSection === "basic") {
    const message = entryBasicRequirementMessage(nextEntry, dictionary);
    if (message) {
      showToast(message);
      return false;
    }
  } else if (partialEditSection === "definitions") {
    const message = entryDefinitionsRequirementMessage(nextEntry, dictionary);
    if (message) {
      showToast(message);
      return false;
    }
  }

  if (entriesHaveSameSemantics(nextEntry, entry)) {
    cancelPartialEdit();
    render();
    showToast(t("noChangesToSave"));
    return true;
  }

  const shouldScrollAfterSave = partialEditSection === "basic" && previousLemma !== nextEntry.lemma;
  try {
    const savedEntry = await api(`/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries/${encodeURIComponent(entry.id)}`, {
      method: "PUT",
      body: JSON.stringify(entryApiPayload(nextEntry)),
    });
    upsertEntryInDictionary(dictionary.id, savedEntry);
    state.selectedEntryId = savedEntry.id;
    cacheSavedEntryDetail(dictionary.id, savedEntry);
    updateEntrySummaryDtoAfterSave(activeDictionary(), savedEntry);
    cancelPartialEdit();
    resetEntryReadStateAfterSave();
    render();
    if (shouldScrollAfterSave) {
      scheduleEntryCardScroll(savedEntry.id, prepareRootModeEntryNavigation(savedEntry.id));
    }
    showToast(t("savedEntry"));
    return true;
  } catch (error) {
    showApiErrorToast(error, "saveFailed");
    return false;
  }
}

function partialEditBody() {
  return partialEditHost?.querySelector(".partial-edit-body") || null;
}

function partialEditForm() {
  return partialEditHost?.querySelector(".inline-partial-edit-form") || null;
}

function cancelPartialEdit() {
  partialEditHost?.querySelector(".inline-partial-edit-form")?.remove();
  partialEditHost?.classList.remove("partial-editing");
  partialEditHost = null;
  partialEditSection = "";
}

function createEntryDraft(overrides = {}) {
  return {
    id: "",
    lemma: "",
    pronunciation: "",
    tags: [],
    definitions: [],
    etymology: { sources: [], description: "" },
    morphologyMode: "auto",
    morphologyGroups: [],
    notes: "",
    ...overrides,
  };
}

async function beginNewEntry(draft = null) {
  if (!activeDictionary()) {
    await showView("manager");
    showToast(t("createDictionaryFirstToast"));
    return false;
  }
  if (!(await closePendingEditsForPageSwitch())) {
    return false;
  }

  cancelPartialEdit();
  state.selectedEntryId = "";
  entryDraft = createEntryDraft(draft || {});
  editorMode = "edit";
  render();
  elements.lemmaInput.focus();
  return true;
}

async function beginDerivedEntry(sourceEntry) {
  if (!sourceEntry) {
    return;
  }
  const started = await beginNewEntry({
    etymology: {
      sources: [sourceEntry.lemma],
      description: "",
    },
  });
  if (!started) {
    return;
  }
  showToast(t("derivedEntryDraft"));
}

async function beginEditEntry() {
  if (!selectedEntry()) {
    return false;
  }
  if (!(await closePendingEditsForPageSwitch())) {
    return false;
  }
  cancelPartialEdit();
  entryDraft = null;
  editorMode = "edit";
  render();
  elements.lemmaInput.focus();
  return true;
}

function cancelEntryEdit() {
  entryDraft = null;
  editorMode = "display";
  render();
}

function clearEntryForm() {
  state.selectedEntryId = "";
  entryDraft = createEntryDraft();
  editorMode = "edit";
  fillEntryForm(null);
  renderEntries();
  elements.lemmaInput.focus();
}

async function saveEntry(event) {
  event.preventDefault();

  const dictionary = activeDictionary();
  if (!dictionary) {
    showToast(t("createDictionaryFirstToast"));
    return false;
  }

  const entryId = elements.entryId.value || "";
  const existing = dictionary.entries.find((entry) => entry.id === entryId);
  const wasNewEntry = !existing;
  const previousLemma = existing?.lemma || "";
  const candidate = fullEntryFormCandidate(existing);

  const requirementMessage = entrySaveRequirementMessage(candidate, dictionary);
  if (requirementMessage) {
    showToast(requirementMessage);
    return false;
  }

  if (!wasNewEntry && entriesHaveSameSemantics(candidate, existing)) {
    entryDraft = null;
    editorMode = "display";
    render();
    showToast(t("noChangesToSave"));
    return true;
  }

  const now = new Date().toISOString();
  const entry = {
    ...candidate,
    id: entryId || uniqueDictionaryEntityId("entry", dictionary),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  try {
    const savedEntry = await api(
      wasNewEntry
        ? `/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries`
        : `/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries/${encodeURIComponent(entry.id)}`,
      {
        method: wasNewEntry ? "POST" : "PUT",
        body: JSON.stringify(entryApiPayload(entry)),
      },
    );
    upsertEntryInDictionary(dictionary.id, savedEntry);
    state.selectedEntryId = savedEntry.id;
    cacheSavedEntryDetail(dictionary.id, savedEntry);
    updateEntrySummaryDtoAfterSave(activeDictionary(), savedEntry);
    entryDraft = null;
    editorMode = "display";
    resetEntryReadStateAfterSave();
    render();
    if (wasNewEntry || previousLemma !== savedEntry.lemma) {
      scheduleEntryCardScroll(savedEntry.id, prepareRootModeEntryNavigation(savedEntry.id));
    }
    showToast(t("savedEntry"));
    return true;
  } catch (error) {
    showApiErrorToast(error, "saveFailed");
    return false;
  }
}

async function deleteSelectedEntry() {
  await deleteEntryById(selectedEntry()?.id);
}

async function deleteEntryById(entryId) {
  const dictionary = activeDictionary();
  const entry = dictionary?.entries.find((item) => item.id === entryId);
  if (!dictionary || !entry) {
    return false;
  }

  const confirmed = await appConfirm(`${t("deleteConfirmEntry")} “${entry.lemma}”?`, { danger: true });
  if (!confirmed) {
    return false;
  }

  const nextEntries = dictionary.entries.filter((item) => item.id !== entry.id);
  try {
    const deleted = await api(`/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries/${encodeURIComponent(entry.id)}`, {
      method: "DELETE",
    });
    removeEntryFromDictionary(dictionary.id, entry.id, deleted);
    if (state.selectedEntryId === entry.id || !nextEntries.some((item) => item.id === state.selectedEntryId)) {
      state.selectedEntryId = firstLemmaEntry({ ...dictionary, entries: nextEntries })?.id || "";
      editorMode = "display";
      entryDraft = null;
      cancelPartialEdit();
    }
    resetEntryReadStateAfterSave();
    render();
    showToast(t("deletedEntry"));
    return true;
  } catch (error) {
    showApiErrorToast(error, "saveFailed");
    return false;
  }
}

async function prepareNewDictionary() {
  if (!(await confirmLeaveUnsavedDictionaryForm())) {
    return;
  }
  state.selectedDictionaryConfigId = "";
  fillDictionaryForm(null);
  renderDictionaryManager();
  elements.dictionaryNameInput.focus();
}

async function saveDictionary(event) {
  event.preventDefault();

  const dictionaryId = elements.dictionaryId.value;
  const payload = {
    name: elements.dictionaryNameInput.value.trim(),
    language: elements.dictionaryLanguageInput.value.trim(),
    description: elements.dictionaryDescriptionInput.value.trim(),
  };

  if (!payload.name) {
    showToast(t("name"));
    return false;
  }

  if (dictionaryId && !dictionaryFormIsDirty()) {
    showToast(t("noChangesToSave"));
    return true;
  }

  try {
    if (dictionaryId) {
      const saved = await api(`/api/dictionaries/${encodeURIComponent(dictionaryId)}/meta`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      updateDictionaryMetadataInState(saved);
      state.selectedDictionaryConfigId = dictionaryId;
      render();
      showToast(t("dictionarySaved"));
    } else {
      const created = await api("/api/dictionaries", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      state.selectedDictionaryConfigId = created.id;
      state.activeDictionaryId = created.id;
      resetRootExpansionState();
      state.selectedEntryId = "";
      editorMode = "display";
      showToast(t("dictionaryCreated"));
    }

    await refreshState();
    return true;
  } catch (error) {
    showApiErrorToast(error, "dictionarySaveFailed");
    return false;
  }
}

function invalidateDictionaryQueryCache(dictionaryId) {
  queryPageCache.invalidateDictionary(dictionaryId);
  entryDetailCache.invalidateDictionary(dictionaryId);
  if (selectedEntryDetailState.dictionaryId === dictionaryId) {
    resetSelectedEntryDetailState();
  }
}

function replaceDictionaryInState(saved) {
  const normalized = normalizeDictionary(saved);
  invalidateDictionaryQueryCache(normalized.id);
  const dictionaryIndex = state.dictionaries.findIndex((dictionary) => dictionary.id === normalized.id);
  if (dictionaryIndex >= 0) {
    state.dictionaries[dictionaryIndex] = normalized;
  } else {
    state.dictionaries.push(normalized);
  }
  loadedDictionaryIds.add(normalized.id);
  return normalized;
}

function replaceLoadedDictionarySource(dictionaryId, source) {
  const dictionaryIndex = state.dictionaries.findIndex((dictionary) => dictionary.id === dictionaryId);
  if (dictionaryIndex < 0) {
    return null;
  }
  const normalized = normalizeDictionary(source);
  invalidateDictionaryQueryCache(dictionaryId);
  state.dictionaries[dictionaryIndex] = normalized;
  loadedDictionaryIds.add(normalized.id);
  return normalized;
}

function updateDictionarySummaryFromEntries(dictionary, options = {}) {
  const previousSummary = normalizeDictionarySummary(dictionary.summary);
  return {
    entryCount: dictionary.entries.length,
    rootCount: options.recomputeRootCount === false
      ? previousSummary?.rootCount ?? null
      : dictionaryRootCount(dictionary),
  };
}

function updateDictionaryMetadataInState(payload) {
  if (!payload?.id) {
    return null;
  }
  const dictionaryIndex = state.dictionaries.findIndex((dictionary) => dictionary.id === payload.id);
  if (dictionaryIndex < 0) {
    return null;
  }
  invalidateDictionaryQueryCache(payload.id);
  const current = state.dictionaries[dictionaryIndex];
  const next = {
    ...current,
    ...(Object.hasOwn(payload, "name") ? { name: payload.name } : {}),
    ...(Object.hasOwn(payload, "language") ? { language: payload.language } : {}),
    ...(Object.hasOwn(payload, "description") ? { description: payload.description } : {}),
    ...(Object.hasOwn(payload, "createdAt") ? { createdAt: payload.createdAt } : {}),
    ...(Object.hasOwn(payload, "updatedAt") ? { updatedAt: payload.updatedAt } : {}),
    ...(Object.hasOwn(payload, "summary") ? { summary: normalizeDictionarySummary(payload.summary) } : {}),
  };
  state.dictionaries[dictionaryIndex] = next;
  return next;
}

function applyDictionaryModulePayload(payload) {
  if (!payload?.id) {
    return null;
  }
  const dictionary = state.dictionaries.find((item) => item.id === payload.id);
  if (!dictionary) {
    return null;
  }
  const next = {
    ...dictionary,
    ...(Object.hasOwn(payload, "updatedAt") ? { updatedAt: payload.updatedAt } : {}),
    ...(Object.hasOwn(payload, "settings") ? { settings: payload.settings } : {}),
    ...(Object.hasOwn(payload, "docs") ? { docs: payload.docs } : {}),
    ...(Object.hasOwn(payload, "corpus") ? { corpus: payload.corpus } : {}),
    ...(Object.hasOwn(payload, "morphology") ? { morphology: payload.morphology } : {}),
  };
  const normalized = replaceLoadedDictionarySource(payload.id, next);
  if (normalized) {
    normalized.summary = normalizeDictionarySummary(dictionary.summary);
  }
  return normalized;
}

function upsertEntryInDictionary(dictionaryId, entry, options = {}) {
  if (!entry?.id) {
    return null;
  }
  const dictionary = state.dictionaries.find((item) => item.id === dictionaryId);
  if (!dictionary) {
    return null;
  }
  const entries = [...dictionary.entries];
  const entryIndex = entries.findIndex((item) => item.id === entry.id);
  if (entryIndex >= 0) {
    entries[entryIndex] = entry;
  } else {
    entries.push(entry);
  }
  const normalized = replaceLoadedDictionarySource(dictionaryId, {
    ...dictionary,
    updatedAt: options.updatedAt || entry.updatedAt || dictionary.updatedAt,
    entries,
  });
  if (normalized) {
    normalized.summary = updateDictionarySummaryFromEntries(normalized, { recomputeRootCount: options.recomputeRootCount });
  }
  return normalized?.entries.find((item) => item.id === entry.id) || null;
}

function removeEntryFromDictionary(dictionaryId, entryId, payload = {}) {
  const dictionary = state.dictionaries.find((item) => item.id === dictionaryId);
  if (!dictionary) {
    return null;
  }
  const normalized = replaceLoadedDictionarySource(dictionaryId, {
    ...dictionary,
    updatedAt: payload.updatedAt || dictionary.updatedAt,
    entries: dictionary.entries.filter((entry) => entry.id !== entryId),
  });
  if (normalized) {
    normalized.summary = updateDictionarySummaryFromEntries(normalized);
  }
  return normalized;
}

function applyEntryPatchPayload(payload) {
  if (!payload?.id) {
    return null;
  }
  const dictionary = state.dictionaries.find((item) => item.id === payload.id);
  if (!dictionary) {
    return null;
  }
  const changedEntries = Array.isArray(payload.entries) ? payload.entries : [];
  const changedById = new Map(changedEntries.map((entry) => [entry.id, entry]));
  const nextEntries = dictionary.entries.map((entry) => changedById.get(entry.id) || entry);
  const normalized = replaceLoadedDictionarySource(payload.id, {
    ...dictionary,
    updatedAt: payload.updatedAt || dictionary.updatedAt,
    ...(Object.hasOwn(payload, "settings") ? { settings: payload.settings } : {}),
    entries: nextEntries,
  });
  if (normalized) {
    normalized.summary = updateDictionarySummaryFromEntries(normalized, { recomputeRootCount: false });
  }
  return normalized;
}

function resetEntryReadStateAfterSave() {
  resetEntryQueryState();
  resetEntryFacetsState();
  resetRootGroupsQueryState();
  entryRelationsCache.clear();
  rootGroupDerivedStates.clear();
}

async function activateDictionary(dictionaryId) {
  const dictionary = state.dictionaries.find((item) => item.id === dictionaryId);
  if (!dictionary) {
    return;
  }

  try {
    await api(`/api/dictionaries/${encodeURIComponent(dictionaryId)}/activate`, { method: "POST" });
    state.activeDictionaryId = dictionary.id;
    resetRootExpansionState();
    state.selectedDictionaryConfigId = dictionary.id;
    state.selectedEntryId = firstLemmaEntry(dictionary)?.id || "";
    editorMode = "display";
    advancedFilter = null;
    searchQuery = "";
    activePart = "";
    elements.searchInput.value = "";
    elements.partFilter.value = "";
    await refreshState();
    showToast(`${t("switchedTo")} “${dictionary.name}”`);
  } catch (error) {
    showApiErrorToast(error, "dictionarySwitchFailed");
  }
}

async function deleteSelectedDictionary() {
  const dictionary = selectedDictionaryConfig();
  if (!dictionary) {
    return;
  }

  const confirmed = await appConfirm(`${t("deleteConfirmDictionary")} “${dictionary.name}” ${t("andItsEntries")} ${dictionaryEntryCount(dictionary)} ${t("entries")}?`, { danger: true });
  if (!confirmed) {
    return;
  }

  try {
    await api(`/api/dictionaries/${encodeURIComponent(dictionary.id)}`, { method: "DELETE" });
    forgetAnalysisViewState(dictionary.id);
    forgetQualityViewState(dictionary.id);
    corpusViewStates.delete(dictionary.id);
    if (corpusDraftState?.dictionaryId === dictionary.id) {
      corpusDraftState = null;
    }
    if (docsDraftState?.dictionaryId === dictionary.id) {
      docsDraftState = null;
    }
    state.selectedDictionaryConfigId = "";
    state.selectedEntryId = "";
    resetRootExpansionState();
    editorMode = "display";
    await refreshState();
    showToast(t("dictionaryDeleted"));
  } catch (error) {
    showApiErrorToast(error, "dictionaryDeleteFailed");
  }
}

function exportDictionary(dictionaryId) {
  if (!dictionaryId) {
    showToast(t("createDictionaryFirstToast"));
    return;
  }
  window.location.href = `/api/export?dictionaryId=${encodeURIComponent(dictionaryId)}`;
}

function isDictionaryImportPayload(payload) {
  if (Array.isArray(payload?.dictionaries)) {
    return payload.dictionaries.length > 0;
  }
  return Boolean(
    payload
    && typeof payload === "object"
    && !Array.isArray(payload)
    && (payload.id || payload.name || Array.isArray(payload.entries) || payload.settings || payload.docs || payload.corpus || payload.morphology)
  );
}

function dictionaryFromImportPayload(payload) {
  if (Array.isArray(payload?.dictionaries)) {
    return payload.dictionaries.find((item) => item?.id === payload.activeDictionaryId) || payload.dictionaries[0] || null;
  }
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
}

function isValidDictionaryId(id) {
  return /^dict-[a-z0-9-]+$/i.test(String(id || "").trim());
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", async () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!isDictionaryImportPayload(imported)) {
        throw new Error("Invalid file");
      }
      const dictionary = dictionaryFromImportPayload(imported);
      if (!validateDictionaryEntityIds(normalizeDictionary(dictionary))) {
        return;
      }
      const dictionaryId = String(dictionary.id || "").trim();
      let regenerateId = false;
      if (dictionaryId && !isValidDictionaryId(dictionaryId)) {
        regenerateId = await appConfirm(formatText("importInvalidIdMessage", {
          id: dictionaryId,
        }), {
          title: t("importInvalidIdTitle"),
          confirmText: t("importAndRegenerateId"),
          cancelText: t("cancel"),
        });
        if (!regenerateId) {
          return;
        }
      }
      const existing = !regenerateId ? state.dictionaries.find((item) => item.id === dictionaryId) : null;
      let overwrite = false;
      if (existing) {
        overwrite = await appConfirm(formatText("importOverwriteMessage", {
          id: dictionaryId,
          name: dictionary.name || t("unnamedDictionary"),
        }), {
          title: t("importOverwriteTitle"),
          confirmText: t("importAndOverwrite"),
          cancelText: t("cancel"),
          danger: true,
        });
        if (!overwrite) {
          return;
        }
      }
      const query = new URLSearchParams();
      if (overwrite) {
        query.set("overwrite", "true");
      }
      if (regenerateId) {
        query.set("regenerateId", "true");
      }
      const importUrl = `/api/import${query.toString() ? `?${query}` : ""}`;
      await api(importUrl, {
        method: "POST",
        body: JSON.stringify(imported),
      });
      if (overwrite) {
        corpusViewStates.delete(dictionary.id);
        forgetAnalysisViewState(dictionary.id);
        forgetQualityViewState(dictionary.id);
        if (corpusDraftState?.dictionaryId === dictionary.id) {
          corpusDraftState = null;
        }
        if (docsDraftState?.dictionaryId === dictionary.id) {
          docsDraftState = null;
        }
      }
      state.selectedEntryId = "";
      editorMode = "display";
      await refreshState();
      showToast(t("imported"));
    } catch (error) {
      showApiErrorToast(error, "importFailed");
    } finally {
      elements.importInput.value = "";
    }
  });
  reader.readAsText(file);
}

async function refreshState() {
  const serverState = await api("/api/state");
  backendAvailable = true;
  backendMessage = "";
  currentLanguage = normalizeUiLanguage(serverState.uiLanguage);
  currentTheme = normalizeUiTheme(serverState.uiTheme);
  await applyServerState({
    ...serverState,
    selectedEntryId: state.selectedEntryId,
    selectedDictionaryConfigId: state.selectedDictionaryConfigId || serverState.activeDictionaryId,
    activeView: state.activeView,
  });
  resetEntryQueryState();
  resetEntryFacetsState();
  render();
}

async function showView(view) {
  if (view !== state.activeView) {
    rememberProcessScroll();
    if (!(await confirmLeaveUnsavedConfigView())) {
      return;
    }
    const ready = await closePendingEditsForPageSwitch();
    if (!ready) {
      return;
    }
  }
  state.activeView = view;
  render();
  closeMobileDrawers();
}

async function confirmLeaveUnsavedConfigView() {
  if (state.activeView === "manager" && dictionaryFormIsDirty()) {
    return confirmUnsavedChanges(t("unsavedDictionaryConfirm"), {
      save: () => saveDictionary({ preventDefault() {} }),
    });
  }
  if (!activeDictionary()) {
    return true;
  }
  if (state.activeView === "settings" && settingsFormIsDirty()) {
    return confirmUnsavedChanges(t("unsavedSettingsConfirm"), {
      save: () => saveSettings({ preventDefault() {} }),
    });
  }
  if (state.activeView === "ipa" && ipaFormIsDirty()) {
    return confirmUnsavedChanges(t("unsavedIpaConfirm"), {
      save: () => saveIpaSettings({ preventDefault() {} }),
    });
  }
  if (state.activeView === "morphology-functions" && morphologyFunctionsFormIsDirty()) {
    return confirmUnsavedChanges(t("unsavedMorphologyConfirm"), {
      save: () => saveMorphologyFunctions({ preventDefault() {} }),
    });
  }
  if (state.activeView === "morphology-tables" && morphologyTablesFormIsDirty()) {
    return confirmUnsavedChanges(t("unsavedMorphologyConfirm"), {
      save: () => saveMorphologyTables({ preventDefault() {} }),
    });
  }
  const settings = normalizeDictionarySettings(activeDictionary().settings);
  if (state.activeView === "docs" && docsFormIsDirty()) {
    if (settings.docsAutoSave) {
      try {
        return await saveLanguageDocs(false);
      } catch (error) {
        console.error(error);
        return false;
      }
    }
    return confirmUnsavedChanges(t("unsavedDocsConfirm"), {
      save: () => saveLanguageDocs(false),
      discard: discardDocsDraft,
    });
  }
  if (state.activeView === "corpus" && corpusFormIsDirty()) {
    if (settings.corpusAutoSave) {
      try {
        return await saveCorpus(false);
      } catch (error) {
        console.error(error);
        return false;
      }
    }
    return confirmUnsavedChanges(t("unsavedCorpusConfirm"), {
      save: () => saveCorpus(false),
      discard: discardCorpusDraft,
    });
  }
  return true;
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2200);
}

function hasManualModuleChangesOnExit() {
  const dictionary = activeDictionary();
  if (!dictionary) {
    return false;
  }
  const settings = normalizeDictionarySettings(dictionary.settings);
  return (
    (!settings.docsAutoSave && docsFormIsDirty(dictionary))
    || (!settings.corpusAutoSave && corpusFormIsDirty(dictionary))
  );
}

function flushAutomaticModuleSaves() {
  const dictionary = activeDictionary();
  if (!dictionary) {
    return;
  }
  syncCorpusEditorToDraft();
  const settings = normalizeDictionarySettings(dictionary.settings);
  const body = { updatedAt: new Date().toISOString() };
  if (settings.docsAutoSave && docsFormIsDirty(dictionary)) {
    body.docs = {
      ...(dictionary.docs || {}),
      markdown: docsDraftState.markdown,
    };
  }
  if (settings.corpusAutoSave && corpusFormIsDirty(dictionary)) {
    body.corpus = cloneCorpus(corpusDraftState.corpus);
  }
  if (!body.docs && !body.corpus) {
    return;
  }
  const payload = JSON.stringify(body);
  const autosavePath = `/api/dictionaries/${encodeURIComponent(dictionary.id)}/autosave`;
  const queued = typeof navigator.sendBeacon === "function"
    && navigator.sendBeacon(autosavePath, new Blob([payload], { type: "application/json" }));
  if (queued) {
    return;
  }
  fetch(autosavePath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch((error) => console.error(error));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

elements.searchInput.addEventListener("input", (event) => {
  if (advancedFilter) {
    event.target.value = "";
    return;
  }
  searchQuery = event.target.value;
  renderPartFilter();
  window.clearTimeout(entrySearchDebounceTimer);
  entrySearchDebounceTimer = window.setTimeout(() => {
    entrySearchDebounceTimer = 0;
    renderEntries();
  }, ENTRY_SEARCH_DEBOUNCE_MS);
});

elements.rootModeToggleButton.addEventListener("click", () => {
  if (advancedFilter) {
    return;
  }
  rootMode = !rootMode;
  rootNavigationContextId = "";
  if (rootMode) {
    activePart = "";
    elements.partFilter.value = "";
  }
  renderPartFilter();
  renderEntries();
});

elements.expandAllRootsButton.addEventListener("click", () => {
  if (
    advancedFilter
    || normalizeEntrySearchText(searchQuery)
    || rootGroupsQueryState.status !== "success"
  ) {
    return;
  }
  rootExpansionMode = "all";
  expandedRootEntries.clear();
  collapsedRootEntries.clear();
  refreshRootGroupWindowHeightEstimates();
  renderPartFilter();
  renderEntries();
});

elements.collapseAllRootsButton.addEventListener("click", () => {
  if (advancedFilter || normalizeEntrySearchText(searchQuery)) {
    return;
  }
  resetRootExpansionState();
  renderPartFilter();
  renderEntries();
});

elements.partFilter.addEventListener("change", (event) => {
  if (advancedFilter || rootMode) {
    activePart = "";
    elements.partFilter.value = "";
    return;
  }
  activePart = event.target.value;
  renderEntries();
});

elements.sortSelect.addEventListener("change", (event) => {
  entrySort = event.target.value;
  renderEntries();
});

elements.toolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.view) {
      showView(button.dataset.view);
      return;
    }
    showToast(t("switchToolPlanned"));
  });
});

elements.definitionFormList.addEventListener("click", (event) => {
  const optionalButton = event.target.closest('[data-action="add-definition-optional"]');
  if (optionalButton) {
    renderDefinitionFormCardInPlace(
      optionalButton.closest(".definition-form-card"),
      optionalButton.dataset.optionalDefinitionField,
    );
    return;
  }

  const button = event.target.closest('[data-action="remove-definition"]');
  if (!button) {
    return;
  }
  button.closest(".definition-form-card").remove();
  renderDefinitionFormList(definitionFormStates(elements.definitionFormList));
});

elements.entryDisplay.addEventListener("contextmenu", (event) => {
  if (event.target.closest(".inline-partial-edit-form")) {
    return;
  }
  const section = event.target.closest("[data-edit-section]");
  if (!section || editorMode === "edit") {
    return;
  }
  event.preventDefault();
  openPartialEdit(section.dataset.editSection);
});

elements.entryDisplay.addEventListener("click", async (event) => {
  const tagTarget = event.target.closest("[data-entry-tag-index]");
  if (tagTarget && elements.entryDisplay.contains(tagTarget)) {
    const entry = selectedEntry();
    if (entry) {
      event.preventDefault();
      event.stopPropagation();
      applyTagFilter(entry, Number(tagTarget.dataset.entryTagIndex), tagTarget.dataset.entryTagValue || "");
    }
    return;
  }

  const cancelButton = event.target.closest('[data-action="cancel-partial-edit"]');
  if (cancelButton) {
    cancelPartialEdit();
    return;
  }

  const autoIpaButton = event.target.closest('[data-action="partial-auto-ipa"]');
  if (autoIpaButton) {
    const body = partialEditBody();
    const lemmaInput = body?.querySelector('[data-field="lemma"]');
    const pronunciationInput = body?.querySelector('[data-field="pronunciation"]');
    if (lemmaInput && pronunciationInput) {
      applyAutoIpa(pronunciationInput, lemmaInput);
    }
    return;
  }

  const morphologyAction = event.target.closest("[data-action]")?.dataset.action;
  if (morphologyAction === "toggle-entry-morphology-mode") {
    const entry = selectedEntry() || {};
    await toggleMorphologyEditorMode(partialEditBody()?.querySelector(".partial-morphology-controls"), entry);
    return;
  }
  if (morphologyAction === "move-entry-morphology-group-up" || morphologyAction === "move-entry-morphology-group-down") {
    const card = event.target.closest(".entry-morphology-group-card");
    const list = card?.parentElement;
    if (card && list) {
      if (morphologyAction.endsWith("up") && card.previousElementSibling) {
        list.insertBefore(card, card.previousElementSibling);
      } else if (morphologyAction.endsWith("down") && card.nextElementSibling) {
        list.insertBefore(card.nextElementSibling, card);
      }
    }
    return;
  }
  if (morphologyAction === "remove-entry-morphology-group") {
    event.target.closest(".entry-morphology-group-card")?.remove();
    return;
  }
  if (morphologyAction === "add-entry-morphology-group") {
    const entry = selectedEntry() || {};
    const host = partialEditBody()?.querySelector(".partial-morphology-controls");
    const current = collectMorphologyEntryState(host, entry);
    const selected = host?.querySelector('[data-field="addMorphologyGroup"]')?.value || "";
    if (selected && !current.morphologyGroups.some((group) => group.templateGroupId === selected)) {
      current.morphologyGroups.push({ templateGroupId: selected, title: "", notes: "", overrides: {} });
    }
    current.morphologyMode = "manual";
    renderMorphologyEntryControls(host, { ...entry, ...current });
    return;
  }

  const addButton = event.target.closest('[data-action="add-partial-definition"]');
  if (addButton) {
    const list = partialEditBody()?.querySelector('[data-partial-definitions="true"]');
    const definitions = definitionFormStates(list);
    definitions.push(normalizeDefinition());
    renderPartialDefinitionList(definitions);
    return;
  }

  const optionalButton = event.target.closest('[data-action="add-definition-optional"]');
  if (optionalButton) {
    renderDefinitionFormCardInPlace(
      optionalButton.closest(".definition-form-card"),
      optionalButton.dataset.optionalDefinitionField,
    );
    return;
  }

  const removeButton = event.target.closest('[data-action="remove-partial-definition"]');
  if (!removeButton) {
    return;
  }
  removeButton.closest(".definition-form-card").remove();
  renderPartialDefinitionList(definitionFormStates(partialEditBody()?.querySelector('[data-partial-definitions="true"]')));
});

elements.entryDisplay.addEventListener("submit", (event) => {
  if (!event.target.closest(".inline-partial-edit-form")) {
    return;
  }
  savePartialEdit(event);
});

bindSourceAutocompleteInput(elements.sourceEntryInput);

elements.addDefinitionButton.addEventListener("click", () => {
  const definitions = definitionFormStates(elements.definitionFormList);
  definitions.push(normalizeDefinition());
  renderDefinitionFormList(definitions);
});

elements.entryList.addEventListener("pointerover", (event) => {
  const issue = event.target instanceof Element ? event.target.closest(".entry-quality-issue") : null;
  if (!issue || !elements.entryList.contains(issue)) {
    return;
  }
  updateEntryQualityIssueTooltipPlacement(issue);
});
elements.entryList.addEventListener("scroll", updateHoveredEntryQualityIssueTooltipPlacement, { passive: true });

document.addEventListener("pointerover", (event) => {
  const target = appTooltipTargetFromEvent(event);
  if (!target || activeAppTooltipTarget === target) {
    return;
  }
  showAppTooltip(target);
});
document.addEventListener("pointerout", (event) => {
  const target = appTooltipTargetFromEvent(event);
  if (!target || activeAppTooltipTarget !== target) {
    return;
  }
  if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) {
    return;
  }
  if (!appTooltipTargetHasKeyboardFocus(target)) {
    hideAppTooltip();
  }
});
document.addEventListener("pointermove", syncAppTooltipVisibility, { passive: true });
document.addEventListener("pointercancel", hideAppTooltip);
document.addEventListener("mouseleave", hideAppTooltip);
window.addEventListener("blur", hideAppTooltip);
window.addEventListener("resize", hideAppTooltip);
window.addEventListener("scroll", hideAppTooltip, { passive: true });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    hideAppTooltip();
  }
});
document.addEventListener("focusin", (event) => {
  const target = appTooltipTargetFromEvent(event);
  if (target) {
    showAppTooltip(target);
  }
});
document.addEventListener("focusout", (event) => {
  const target = appTooltipTargetFromEvent(event);
  if (!target || activeAppTooltipTarget !== target) {
    return;
  }
  if (!target.matches(":hover")) {
    hideAppTooltip();
  }
});
elements.toolList.addEventListener("scroll", hideAppTooltip);
elements.navCollapseButton.addEventListener("click", () => {
  if (!wideNavMediaQuery.matches) {
    return;
  }
  shellState.wideNavCollapsed = !shellState.wideNavCollapsed;
  renderShellNav();
  scheduleEntryBrowserLayoutRefresh();
});
elements.mobileNavButton.addEventListener("click", () => {
  if (shellState.navDrawerOpen) {
    closeMobileDrawers();
    return;
  }
  openMobileNavDrawer();
});
elements.mobileEntryListButton.addEventListener("click", () => {
  if (shellState.browserDrawerOpen) {
    closeMobileEntryBrowserDrawer();
    return;
  }
  openMobileEntryBrowserDrawer();
});
elements.mobileNewEntryButton.addEventListener("click", async () => {
  if (await beginNewEntry()) {
    closeMobileDrawers();
  }
});
elements.mobileDrawerBackdrop.addEventListener("click", closeMobileDrawers);
elements.entryBrowserToggleButton.addEventListener("click", toggleEntryBrowser);
elements.backToEditorButton.addEventListener("click", () => showView("editor"));
elements.backToEditorFromSettingsButton.addEventListener("click", () => showView("editor"));
elements.backToEditorFromAnalysisButton.addEventListener("click", () => showView("editor"));
elements.backToEditorFromQualityButton.addEventListener("click", () => showView("editor"));
elements.backToEditorFromDocsButton.addEventListener("click", () => showView("editor"));
elements.backToEditorFromCorpusButton.addEventListener("click", () => showView("editor"));
elements.backToEditorFromMorphologyFunctionsButton.addEventListener("click", () => showView("editor"));
elements.backToEditorFromMorphologyTablesButton.addEventListener("click", () => showView("editor"));
elements.backToEditorFromIpaButton.addEventListener("click", () => showView("editor"));
elements.addDictionaryButton.addEventListener("click", prepareNewDictionary);
elements.emptyCreateDictionaryButton.addEventListener("click", () => showView("manager"));
elements.settingsOpenDictionaryManagerButton.addEventListener("click", () => showView("manager"));
elements.analysisOpenDictionaryManagerButton.addEventListener("click", () => showView("manager"));
elements.qualityOpenDictionaryManagerButton.addEventListener("click", () => showView("manager"));
elements.docsOpenDictionaryManagerButton.addEventListener("click", () => showView("manager"));
elements.corpusOpenDictionaryManagerButton.addEventListener("click", () => showView("manager"));
elements.morphologyFunctionsOpenDictionaryManagerButton.addEventListener("click", () => showView("manager"));
elements.morphologyTablesOpenDictionaryManagerButton.addEventListener("click", () => showView("manager"));
elements.ipaOpenDictionaryManagerButton.addEventListener("click", () => showView("manager"));
elements.newEntryButton.addEventListener("click", () => beginNewEntry());
elements.entryListNewEntryButton.addEventListener("click", async () => {
  if (await beginNewEntry()) {
    closeMobileEntryBrowserDrawer();
  }
});
elements.editEntryButton.addEventListener("click", beginEditEntry);
elements.analysisPanel.addEventListener("click", (event) => {
  const pageButton = event.target.closest("[data-analysis-page]");
  if (pageButton) {
    rememberProcessScroll();
    const analysisViewState = activeAnalysisViewState();
    analysisViewState.page = pageButton.dataset.analysisPage || "overview";
    const firstSubpage = analysisSubpages(analysisViewState.page)[0]?.[0] || "";
    if (firstSubpage && !analysisViewState.subpageByPage[analysisViewState.page]) {
      analysisViewState.subpageByPage[analysisViewState.page] = firstSubpage;
    }
    renderAnalysis(activeDictionary());
    restoreProcessScroll();
    return;
  }
  const subpageButton = event.target.closest("[data-analysis-subpage]");
  if (subpageButton) {
    rememberProcessScroll();
    const analysisViewState = activeAnalysisViewState();
    analysisViewState.subpageByPage[analysisViewState.page] = subpageButton.dataset.analysisSubpage || "";
    renderAnalysis(activeDictionary());
    restoreProcessScroll();
    return;
  }
  const viewTarget = event.target.closest("[data-view-target]");
  if (viewTarget) {
    advancedFilter = null;
    state.activeView = viewTarget.dataset.viewTarget || "editor";
    if (state.activeView === "editor") {
      revealEntryBrowserForResults();
    }
    render();
    return;
  }
  const partFilterTarget = event.target.closest("[data-part-filter-value]");
  if (partFilterTarget) {
    advancedFilter = null;
    rootMode = false;
    activePart = partFilterTarget.dataset.partFilterValue || "";
    searchQuery = "";
    state.activeView = "editor";
    revealEntryBrowserForResults();
    const dictionary = activeDictionary();
    const firstEntry = dictionary
      ? [...dictionary.entries]
        .filter((entry) => {
          const parts = entryParts(entry, dictionary);
          return activePart === NO_PART_FILTER_VALUE ? !parts.length : parts.includes(activePart);
        })
        .sort(compareEntries)[0]
      : null;
    if (firstEntry) {
      state.selectedEntryId = firstEntry.id;
      editorMode = "display";
      entryDraft = null;
    }
    render();
    scheduleEntryCardScroll(state.selectedEntryId);
    return;
  }
  const filterTarget = event.target.closest("[data-advanced-filter-id]");
  if (filterTarget) {
    const action = analysisFilterRegistry.get(filterTarget.dataset.advancedFilterId);
    enterAdvancedFilter(action);
    return;
  }
  const target = event.target.closest("[data-entry-id]");
  if (!target) {
    return;
  }
  state.activeView = "editor";
  advancedFilter = null;
  switchToEntry(target.dataset.entryId);
});
elements.qualityPanel.addEventListener("click", (event) => {
  const qualityInfoButton = event.target.closest('[data-action="quality-filter-info"]');
  if (qualityInfoButton) {
    appInfoDialog(t("qualityFilterInfoTitle"), {
      text: t("qualityFilterInfoBody"),
    });
    return;
  }
  const subpageButton = event.target.closest("[data-quality-subpage]");
  if (subpageButton) {
    rememberProcessScroll();
    const qualityViewState = activeQualityViewState();
    qualityViewState.subpage = subpageButton.dataset.qualitySubpage || "issues";
    renderQuality(activeDictionary());
    restoreProcessScroll();
    return;
  }
  const viewTarget = event.target.closest("[data-view-target]");
  if (viewTarget) {
    advancedFilter = null;
    state.activeView = viewTarget.dataset.viewTarget || "editor";
    if (state.activeView === "editor") {
      revealEntryBrowserForResults();
    }
    render();
    return;
  }
  const partFilterTarget = event.target.closest("[data-part-filter-value]");
  if (partFilterTarget) {
    advancedFilter = null;
    rootMode = false;
    activePart = partFilterTarget.dataset.partFilterValue || "";
    searchQuery = "";
    state.activeView = "editor";
    revealEntryBrowserForResults();
    const dictionary = activeDictionary();
    const firstEntry = dictionary
      ? [...dictionary.entries]
        .filter((entry) => {
          const parts = entryParts(entry, dictionary);
          return activePart === NO_PART_FILTER_VALUE ? !parts.length : parts.includes(activePart);
        })
        .sort(compareEntries)[0]
      : null;
    if (firstEntry) {
      state.selectedEntryId = firstEntry.id;
      editorMode = "display";
      entryDraft = null;
    }
    render();
    scheduleEntryCardScroll(state.selectedEntryId);
    return;
  }
  const filterTarget = event.target.closest("[data-advanced-filter-id]");
  if (filterTarget) {
    const action = analysisFilterRegistry.get(filterTarget.dataset.advancedFilterId);
    enterAdvancedFilter(action);
    return;
  }
  const target = event.target.closest("[data-entry-id]");
  if (!target) {
    return;
  }
  state.activeView = "editor";
  advancedFilter = null;
  switchToEntry(target.dataset.entryId);
});
elements.advancedFilterRefreshButton.addEventListener("click", refreshAdvancedFilter);
elements.advancedFilterCycleButton.addEventListener("click", cycleAdvancedFilterVariant);
elements.advancedFilterExitButton.addEventListener("click", exitAdvancedFilter);
elements.openLexicalNetworkButton.addEventListener("click", openLexicalNetwork);
elements.closeLexicalNetworkButton.addEventListener("click", closeLexicalNetwork);
elements.lexicalNetworkOverlay.addEventListener("click", (event) => {
  if (event.target === elements.lexicalNetworkOverlay) {
    closeLexicalNetwork();
  }
});
elements.autoIpaButton.addEventListener("click", () => applyAutoIpa());
elements.cancelEditButton.addEventListener("click", cancelEntryEdit);
elements.clearEntryButton.addEventListener("click", clearEntryForm);
elements.deleteEntryButton.addEventListener("click", deleteSelectedEntry);
elements.entryForm.addEventListener("submit", saveEntry);
elements.dictionaryForm.addEventListener("submit", saveDictionary);
elements.tagsInput.addEventListener("input", () => {
  const baseEntry = entryDraft || selectedEntry() || {};
  const current = collectMorphologyEntryState(elements.entryMorphologyControls, baseEntry);
  if (current.morphologyMode === "auto") {
    renderMorphologyEntryControls(elements.entryMorphologyControls, {
      ...baseEntry,
      ...current,
      tags: splitList(elements.tagsInput.value),
    }, { full: true });
  }
});
elements.entryMorphologyControls.addEventListener("click", async (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "toggle-entry-morphology-mode") {
    await toggleMorphologyEditorMode(elements.entryMorphologyControls, entryDraft || selectedEntry() || {}, { full: true });
    return;
  }
  if (action === "move-entry-morphology-group-up" || action === "move-entry-morphology-group-down") {
    const card = event.target.closest(".entry-morphology-group-card");
    const list = card?.parentElement;
    if (card && list) {
      if (action.endsWith("up") && card.previousElementSibling) {
        list.insertBefore(card, card.previousElementSibling);
      } else if (action.endsWith("down") && card.nextElementSibling) {
        list.insertBefore(card.nextElementSibling, card);
      }
    }
    return;
  }
  if (action === "remove-entry-morphology-group") {
    event.target.closest(".entry-morphology-group-card")?.remove();
    return;
  }
  if (action !== "add-entry-morphology-group") {
    return;
  }
  const baseEntry = entryDraft || selectedEntry() || {};
  const current = collectMorphologyEntryState(elements.entryMorphologyControls, baseEntry);
  const selected = elements.entryMorphologyControls.querySelector('[data-field="addMorphologyGroup"]')?.value || "";
  if (selected && !current.morphologyGroups.some((group) => group.templateGroupId === selected)) {
    current.morphologyGroups.push({ templateGroupId: selected, title: "", notes: "", overrides: {} });
  }
  current.morphologyMode = "manual";
  renderMorphologyEntryControls(elements.entryMorphologyControls, { ...baseEntry, ...current }, { full: true });
});
elements.settingsForm.addEventListener("submit", saveSettings);
elements.manualPartOfSpeechTagsInput.addEventListener("change", syncPartOfSpeechTagSettingsControls);
elements.searchFieldEnabledInputs.forEach((input) => {
  input.addEventListener("change", syncEntrySearchSettingsControls);
});
elements.addSearchNormalizationRuleButton?.addEventListener("click", () => {
  const card = createSearchNormalizationRuleCard();
  elements.searchNormalizationRuleList.append(card);
  card.querySelector("[data-search-rule-canonical]")?.focus();
});
elements.searchNormalizationRuleList?.addEventListener("click", (event) => {
  if (event.target.closest('[data-action="remove-search-normalization-rule"]')) {
    event.target.closest(".search-normalization-rule-card")?.remove();
  }
});
elements.tagOrderInfoButton.addEventListener("click", () => {
  appInfoDialog(t("tagOrderSettings"), {
    text: t("tagOrderInfoBody"),
  });
});
elements.applyTagSortOrderButton.addEventListener("click", applyTagSortOrder);
elements.toolNavOrderList.addEventListener("dragstart", (event) => {
  const card = event.target.closest(".tool-order-card");
  if (!card) {
    return;
  }
  draggedToolNavView = card.dataset.view || "";
  card.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedToolNavView);
});
elements.toolNavOrderList.addEventListener("dragover", (event) => {
  event.preventDefault();
  const dragging = elements.toolNavOrderList.querySelector(".tool-order-card.dragging");
  if (!dragging) {
    return;
  }
  const before = toolOrderInsertBefore(event.clientY);
  if (before) {
    elements.toolNavOrderList.insertBefore(dragging, before);
  } else {
    elements.toolNavOrderList.append(dragging);
  }
});
elements.toolNavOrderList.addEventListener("dragend", () => {
  elements.toolNavOrderList.querySelector(".tool-order-card.dragging")?.classList.remove("dragging");
  draggedToolNavView = "";
});
elements.toolNavOrderList.addEventListener("drop", (event) => {
  event.preventDefault();
  elements.toolNavOrderList.querySelector(".tool-order-card.dragging")?.classList.remove("dragging");
  draggedToolNavView = "";
});
elements.entrySectionOrderList.addEventListener("dragstart", (event) => {
  const card = event.target.closest(".tool-order-card");
  if (!card) {
    return;
  }
  draggedEntrySectionId = card.dataset.entrySection || "";
  card.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedEntrySectionId);
});
elements.entrySectionOrderList.addEventListener("dragover", (event) => {
  event.preventDefault();
  const dragging = elements.entrySectionOrderList.querySelector(".tool-order-card.dragging");
  if (!dragging) {
    return;
  }
  const before = entrySectionOrderInsertBefore(event.clientY);
  if (before) {
    elements.entrySectionOrderList.insertBefore(dragging, before);
  } else {
    elements.entrySectionOrderList.append(dragging);
  }
});
elements.entrySectionOrderList.addEventListener("dragend", () => {
  elements.entrySectionOrderList.querySelector(".tool-order-card.dragging")?.classList.remove("dragging");
  draggedEntrySectionId = "";
});
elements.entrySectionOrderList.addEventListener("drop", (event) => {
  event.preventDefault();
  elements.entrySectionOrderList.querySelector(".tool-order-card.dragging")?.classList.remove("dragging");
  draggedEntrySectionId = "";
});
elements.corpusModeControl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-corpus-mode]");
  if (!button) {
    return;
  }
  syncCorpusEditorToDraft();
  const viewState = activeCorpusViewState();
  viewState.mode = button.dataset.corpusMode;
  renderCorpus(activeDictionary());
  scheduleCorpusItemScroll(
    viewState.mode,
    viewState.mode === "blocks" ? viewState.selectedBlockId : viewState.selectedUnitId,
    "auto",
  );
});
elements.newCorpusItemButton.addEventListener("click", () => {
  if (activeCorpusViewState().mode === "blocks") {
    addCorpusBlock();
  } else {
    addCorpusUnit();
  }
});
elements.corpusSearchInput.addEventListener("input", () => {
  const corpus = ensureCorpusDraft();
  if (!corpus) {
    return;
  }
  syncCorpusEditorToDraft();
  const viewState = activeCorpusViewState();
  viewState.query = elements.corpusSearchInput.value;
  renderCorpusItemList(corpus, viewState);
});
elements.corpusItemList.addEventListener("click", (event) => {
  const blockButton = event.target.closest("[data-corpus-block-id]");
  const unitButton = event.target.closest("[data-corpus-unit-id]");
  if (!blockButton && !unitButton) {
    return;
  }
  syncCorpusEditorToDraft();
  const viewState = activeCorpusViewState();
  if (blockButton) {
    viewState.selectedBlockId = blockButton.dataset.corpusBlockId;
  } else {
    viewState.selectedUnitId = unitButton.dataset.corpusUnitId;
  }
  renderCorpus(activeDictionary());
});
elements.saveCorpusButton.addEventListener("click", () => {
  saveCorpus().catch((error) => console.error(error));
});
elements.corpusEditor.addEventListener("submit", (event) => {
  event.preventDefault();
  saveCorpus().catch((error) => console.error(error));
});
elements.corpusEditor.addEventListener("input", (event) => {
  syncCorpusEditorToDraft();
  const form = event.target.closest('.corpus-form[data-corpus-kind="unit"]');
  if (form && event.target.matches('[data-field="content"]')) {
    scheduleCorpusUnitNamePreview(form.dataset.corpusId);
  }
  scheduleCorpusSave();
});
elements.corpusEditor.addEventListener("change", (event) => {
  if (!event.target.matches('[data-field="parent"]')) {
    return;
  }
  syncCorpusEditorToDraft();
  renderCorpus(activeDictionary());
});
elements.corpusEditor.addEventListener("click", async (event) => {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) {
    return;
  }
  const action = actionButton.dataset.action;
  if (action === "add-corpus-attribute") {
    const editor = actionButton.closest("[data-corpus-attributes]");
    editor.querySelector(".corpus-attribute-rows").insertAdjacentHTML("beforeend", renderCorpusAttributeRow());
    editor.querySelector('.corpus-attribute-row:last-child [data-field="attribute-key"]')?.focus();
    return;
  }
  if (action === "remove-corpus-attribute") {
    actionButton.closest(".corpus-attribute-row")?.remove();
    syncCorpusEditorToDraft();
    scheduleCorpusSave();
    return;
  }

  syncCorpusEditorToDraft();
  const dictionary = activeDictionary();
  const corpus = ensureCorpusDraft(dictionary);
  if (!corpus) {
    return;
  }
  const viewState = activeCorpusViewState();
  const form = actionButton.closest(".corpus-form");
  const block = form?.dataset.corpusKind === "block"
    ? corpus.blocks.find((item) => item.id === form.dataset.corpusId)
    : null;

  if (action === "add-corpus-layer" && block) {
    block.layers.push(normalizeCorpusLayer({
      id: uniqueDictionaryEntityId("corpus-layer", { ...dictionary, corpus }),
    }));
    block.updatedAt = new Date().toISOString();
    renderCorpus(dictionary);
    return;
  }
  if (action === "delete-corpus-block" && block) {
    const confirmed = await appConfirm(t("deleteCorpusBlockConfirm"), { danger: true });
    if (!confirmed) {
      return;
    }
    corpus.blocks = corpus.blocks.filter((item) => item.id !== block.id);
    viewState.selectedBlockId = corpus.blocks[0]?.id || "";
    renderCorpus(dictionary);
    return;
  }
  if (action === "delete-corpus-unit") {
    const unitId = form?.dataset.corpusId || "";
    const confirmed = await appConfirm(t("deleteCorpusUnitConfirm"), { danger: true });
    if (!confirmed) {
      return;
    }
    moveCorpusUnitToParent(corpus, unitId, "");
    corpus.units = corpus.units.filter((unit) => unit.id !== unitId);
    viewState.selectedUnitId = corpus.units[0]?.id || "";
    renderCorpus(dictionary);
    return;
  }

  const layerCard = actionButton.closest(".corpus-layer-card");
  const layer = block && layerCard
    ? block.layers.find((item) => item.id === layerCard.dataset.layerId)
    : null;
  if (action === "delete-corpus-layer" && block && layer) {
    const confirmed = await appConfirm(t("deleteCorpusLayerConfirm"), { danger: true });
    if (!confirmed) {
      return;
    }
    block.layers = block.layers.filter((item) => item.id !== layer.id);
    block.updatedAt = new Date().toISOString();
    renderCorpus(dictionary);
    return;
  }
  if ((action === "move-corpus-layer-up" || action === "move-corpus-layer-down") && block && layer) {
    moveArrayItem(block.layers, block.layers.indexOf(layer), action.endsWith("up") ? -1 : 1);
    block.updatedAt = new Date().toISOString();
    renderCorpus(dictionary);
    return;
  }

  const linkedUnits = actionButton.closest(".corpus-linked-units");
  const owner = linkedUnits ? corpusOwnerByKey(linkedUnits.dataset.corpusOwner, corpus) : null;
  if (action === "link-corpus-unit" && owner) {
    const unitId = linkedUnits.querySelector("[data-corpus-unit-link]").value;
    if (unitId) {
      moveCorpusUnitToParent(corpus, unitId, owner.key);
      renderCorpus(dictionary);
    }
    return;
  }
  const linkedItem = actionButton.closest("[data-linked-unit-id]");
  if (!owner || !linkedItem) {
    return;
  }
  const unitId = linkedItem.dataset.linkedUnitId;
  if (action === "unlink-corpus-unit") {
    owner.unitIds.splice(0, owner.unitIds.length, ...owner.unitIds.filter((id) => id !== unitId));
    renderCorpus(dictionary);
    return;
  }
  if (action === "move-corpus-unit-up" || action === "move-corpus-unit-down") {
    moveArrayItem(owner.unitIds, owner.unitIds.indexOf(unitId), action.endsWith("up") ? -1 : 1);
    renderCorpus(dictionary);
  }
});
elements.docsMarkdownInput.addEventListener("input", () => {
  const draft = ensureDocsDraft();
  if (draft) {
    draft.markdown = elements.docsMarkdownInput.value;
  }
  elements.docsPreview.innerHTML = renderMarkdown(elements.docsMarkdownInput.value);
  elements.docsPreview.scrollTop = viewScrollMemory.docsPreview;
  scheduleDocsSave();
});
window.addEventListener("scroll", () => {
  rememberProcessScroll();
  scheduleEntryBrowserHeightUpdate();
}, { passive: true });
elements.docsMarkdownInput.addEventListener("scroll", rememberDocsPaneScroll, { passive: true });
elements.docsPreview.addEventListener("scroll", rememberDocsPaneScroll, { passive: true });
elements.saveDocsButton.addEventListener("click", () => saveLanguageDocs(true));
elements.morphologyFunctionsForm.addEventListener("submit", saveMorphologyFunctions);
elements.morphologyTablesForm.addEventListener("submit", saveMorphologyTables);
elements.morphologyTablesForm.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }
  const input = event.target;
  if (!input?.matches?.("input")) {
    return;
  }
  event.preventDefault();
  if (input.matches('[data-field="rows"], [data-field="cols"]')) {
    applyMorphologyTableSizeChanges();
  }
});
elements.morphologySyntaxButton.addEventListener("click", () => {
  appInfoDialog(t("morphologySyntaxTitle"), {
    html: morphologySyntaxInfoHtml(),
  });
});
elements.closeInfoDialogButton.addEventListener("click", closeInfoDialog);
elements.infoDialog.addEventListener("click", (event) => {
  if (event.target === elements.infoDialog) {
    closeInfoDialog();
  }
});
elements.confirmCancelButton.addEventListener("click", () => closeConfirmDialog(confirmDialogResults.cancel));
elements.confirmAlternateButton.addEventListener("click", () => closeConfirmDialog(confirmDialogResults.alternate));
elements.confirmAcceptButton.addEventListener("click", () => closeConfirmDialog(confirmDialogResults.accept));
elements.confirmDialog.addEventListener("click", (event) => {
  if (event.target === elements.confirmDialog) {
    closeConfirmDialog(confirmDialogResults.cancel);
  }
});
elements.addMorphologyTableGroupButton.addEventListener("click", () => {
  const morphology = morphologyTablesFormSnapshot();
  morphology.templateGroups.push(newMorphologyTableGroup(morphology.templateGroups.length));
  renderMorphologyTablesConfig({ morphology });
});
elements.morphologyTableList.addEventListener("click", (event) => {
  const addTableButton = event.target.closest('[data-action="add-morphology-table"]');
  if (addTableButton) {
    const groupCard = addTableButton.closest(".morphology-group-card");
    const morphology = morphologyTablesFormSnapshot();
    const group = morphology.templateGroups.find((item) => item.id === groupCard?.dataset.templateGroupId);
    if (group) {
      const table = newMorphologyTemplateTable(group.tables.length);
      group.tables.push(table);
      expandedMorphologyTables.add(table.id);
      renderMorphologyTablesConfig({ morphology });
    }
    return;
  }

  const removeGroupButton = event.target.closest('[data-action="remove-morphology-group"]');
  if (removeGroupButton) {
    removeGroupButton.closest(".morphology-group-card")?.querySelectorAll(".morphology-config-card")
      .forEach((tableCard) => expandedMorphologyTables.delete(tableCard.dataset.templateTableId));
    removeGroupButton.closest(".morphology-group-card")?.remove();
    return;
  }

  const toggleButton = event.target.closest('[data-action="toggle-morphology-table"]');
  if (toggleButton) {
    const card = toggleButton.closest(".morphology-config-card");
    const body = card.querySelector(".morphology-card-body");
    const expanded = body.hidden;
    body.hidden = !expanded;
    card.classList.toggle("is-collapsed", !expanded);
    toggleButton.classList.toggle("is-expanded", expanded);
    toggleButton.setAttribute("aria-expanded", String(expanded));
    toggleButton.setAttribute("aria-label", expanded ? t("collapse") : t("expand"));
    hideAppTooltip();
    if (expanded) {
      expandedMorphologyTables.add(card.dataset.templateTableId);
    } else {
      expandedMorphologyTables.delete(card.dataset.templateTableId);
    }
    return;
  }

  const removeButton = event.target.closest('[data-action="remove-morphology-table"]');
  if (removeButton) {
    expandedMorphologyTables.delete(removeButton.closest(".morphology-config-card").dataset.templateTableId);
    removeButton.closest(".morphology-config-card").remove();
    return;
  }
  const resizeButton = event.target.closest('[data-action="resize-morphology-table"]');
  if (resizeButton) {
    applyMorphologyTableSizeChanges();
  }
});
elements.morphologyTableList.addEventListener("dragstart", (event) => {
  const tableHandle = event.target.closest('[data-action="drag-morphology-table"]');
  if (tableHandle) {
    const tableCard = tableHandle.closest(".morphology-config-card");
    if (!tableCard) {
      event.preventDefault();
      return;
    }
    draggedMorphologyTableId = tableCard.dataset.templateTableId || "";
    tableCard.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedMorphologyTableId);
    event.stopPropagation();
    return;
  }
  const groupHandle = event.target.closest('[data-action="drag-morphology-group"]');
  const groupCard = groupHandle?.closest(".morphology-group-card");
  if (!groupCard) {
    event.preventDefault();
    return;
  }
  draggedMorphologyGroupId = groupCard.dataset.templateGroupId || "";
  groupCard.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedMorphologyGroupId);
});
elements.morphologyTableList.addEventListener("dragover", (event) => {
  if (draggedMorphologyTableId) {
    const dragging = elements.morphologyTableList.querySelector(".morphology-config-card.dragging");
    const target = event.target.closest(".morphology-config-card");
    const targetList = event.target.closest(".morphology-group-table-list");
    if (!dragging || !targetList || dragging.parentElement !== targetList || target === dragging) {
      return;
    }
    event.preventDefault();
    if (target) {
      const bounds = target.getBoundingClientRect();
      targetList.insertBefore(dragging, event.clientY < bounds.top + bounds.height / 2 ? target : target.nextSibling);
    } else {
      targetList.append(dragging);
    }
    return;
  }
  if (!draggedMorphologyGroupId) {
    return;
  }
  const dragging = elements.morphologyTableList.querySelector(".morphology-group-card.dragging");
  const target = event.target.closest(".morphology-group-card");
  const targetList = event.target.closest(".morphology-table-list");
  if (!dragging || !targetList || target === dragging) {
    return;
  }
  event.preventDefault();
  if (target) {
    const bounds = target.getBoundingClientRect();
    targetList.insertBefore(dragging, event.clientY < bounds.top + bounds.height / 2 ? target : target.nextSibling);
  } else {
    targetList.append(dragging);
  }
});
elements.morphologyTableList.addEventListener("dragend", () => {
  elements.morphologyTableList.querySelectorAll(".morphology-group-card.dragging, .morphology-config-card.dragging")
    .forEach((card) => card.classList.remove("dragging"));
  draggedMorphologyGroupId = "";
  draggedMorphologyTableId = "";
});
elements.morphologyTableList.addEventListener("drop", (event) => {
  event.preventDefault();
  elements.morphologyTableList.querySelectorAll(".morphology-group-card.dragging, .morphology-config-card.dragging")
    .forEach((card) => card.classList.remove("dragging"));
  draggedMorphologyGroupId = "";
  draggedMorphologyTableId = "";
});
elements.docsModeControl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-doc-mode]");
  if (!button) {
    return;
  }
  docsViewMode = button.dataset.docMode;
  renderLanguageDocs(activeDictionary());
});
elements.ipaForm.addEventListener("submit", saveIpaSettings);
elements.ipaSyllableHelpButton.addEventListener("click", () => {
  appInfoDialog(t("ipaSyllableHelpTitle"), {
    text: t("ipaSyllableHelpBody"),
  });
});
elements.batchIpaAllButton.addEventListener("click", () => batchGenerateIpa("all"));
elements.batchIpaMissingButton.addEventListener("click", () => batchGenerateIpa("missing"));
elements.addIpaMappingButton.addEventListener("click", () => {
  addIpaRule(elements.ipaMappingList);
  renderIpaSandbox();
});
elements.ipaMappingList.addEventListener("dragstart", (event) => {
  const handle = event.target.closest(".ipa-rule-drag-handle");
  const card = handle?.closest(".ipa-rule-card");
  if (!card) {
    event.preventDefault();
    return;
  }
  card.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", "ipa-rule");
});
elements.ipaMappingList.addEventListener("dragover", (event) => {
  const dragging = elements.ipaMappingList.querySelector(".ipa-rule-card.dragging");
  if (!dragging) {
    return;
  }
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  const before = ipaRuleInsertBefore(elements.ipaMappingList, event.clientY);
  if (before) {
    elements.ipaMappingList.insertBefore(dragging, before);
  } else {
    elements.ipaMappingList.append(dragging);
  }
});
elements.ipaMappingList.addEventListener("drop", (event) => {
  event.preventDefault();
  finishIpaRuleDrag();
});
elements.ipaMappingList.addEventListener("dragend", finishIpaRuleDrag);
elements.ipaSandboxInput.addEventListener("input", renderIpaSandbox);
elements.ipaForm.addEventListener("input", renderIpaSandbox);
elements.ipaForm.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="remove-ipa-rule"]');
  if (!button) {
    return;
  }
  button.closest(".ipa-rule-card").remove();
  renderIpaSandbox();
});
elements.deleteDictionaryButton.addEventListener("click", deleteSelectedDictionary);
elements.importInput.addEventListener("change", importData);
elements.themeToggleButton.addEventListener("click", async () => {
  const previousTheme = currentTheme;
  const nextTheme = currentTheme === "dark" ? "light" : "dark";
  currentTheme = nextTheme;
  state.uiTheme = nextTheme;
  cacheUiPreferences({ uiTheme: nextTheme });
  render();
  if (!backendAvailable) {
    return;
  }
  elements.themeToggleButton.disabled = true;
  try {
    const saved = await api("/api/preferences", {
      method: "PUT",
      body: JSON.stringify({ uiTheme: nextTheme }),
    });
    currentTheme = normalizeUiTheme(saved.uiTheme);
    state.uiTheme = currentTheme;
    cacheUiPreferences({ uiTheme: currentTheme });
    render();
  } catch (error) {
    currentTheme = previousTheme;
    state.uiTheme = previousTheme;
    cacheUiPreferences({ uiTheme: previousTheme });
    render();
    showApiErrorToast(error, "themeSaveFailed");
  } finally {
    elements.themeToggleButton.disabled = false;
  }
});
elements.languageToggleButton.addEventListener("click", async () => {
  const previousLanguage = currentLanguage;
  const nextLanguage = currentLanguage === "zh" ? "en" : "zh";
  currentLanguage = nextLanguage;
  state.uiLanguage = nextLanguage;
  refreshAdvancedFilterLocalization();
  render();
  if (!backendAvailable) {
    return;
  }
  elements.languageToggleButton.disabled = true;
  try {
    const saved = await api("/api/preferences", {
      method: "PUT",
      body: JSON.stringify({ uiLanguage: nextLanguage }),
    });
    currentLanguage = normalizeUiLanguage(saved.uiLanguage);
    state.uiLanguage = currentLanguage;
  } catch (error) {
    currentLanguage = previousLanguage;
    state.uiLanguage = previousLanguage;
    refreshAdvancedFilterLocalization();
    render();
    showApiErrorToast(error, "languageSaveFailed");
  } finally {
    elements.languageToggleButton.disabled = false;
  }
});

document.addEventListener("beforeinput", (event) => {
  if (!event.target.matches?.("textarea.ipa-single-line")) {
    return;
  }
  if (event.inputType === "insertLineBreak" || event.inputType === "insertParagraph") {
    event.preventDefault();
  }
});

document.addEventListener("input", (event) => {
  const field = event.target;
  if (!field.matches?.("textarea.ipa-single-line") || !/[\r\n]/.test(field.value)) {
    return;
  }
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  const normalizeLineBreaks = (value) => value.replace(/[\r\n]+/g, " ");
  const nextStart = normalizeLineBreaks(field.value.slice(0, start)).length;
  const nextEnd = normalizeLineBreaks(field.value.slice(0, end)).length;
  field.value = normalizeLineBreaks(field.value);
  field.setSelectionRange(nextStart, nextEnd);
}, true);

function isEditableShortcutTarget(target) {
  return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true'], [contenteditable=''], [role='textbox']"));
}

function isNewEntryShortcutEvent(event) {
  return (event.ctrlKey || event.metaKey)
    && !event.altKey
    && !event.shiftKey
    && event.key === "Enter";
}

async function triggerNewEntryShortcut() {
  if (!backendAvailable) {
    return;
  }
  if (state.activeView !== "editor") {
    await showView("editor");
    if (state.activeView !== "editor") {
      return;
    }
  }
  await beginNewEntry();
}

function handleNewEntryShortcut(event) {
  if (!isNewEntryShortcutEvent(event)) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  if (confirmDialogResolver || !elements.infoDialog.hidden || isEditableShortcutTarget(event.target)) {
    return true;
  }
  if (!event.repeat) {
    triggerNewEntryShortcut().catch((error) => console.error(error));
  }
  return true;
}

window.addEventListener("keydown", handleNewEntryShortcut, { capture: true });

document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented) {
    return;
  }

  if (event.target.matches?.("textarea.ipa-single-line") && event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    event.target.form?.requestSubmit();
    return;
  }

  if (event.key === "Escape" && confirmDialogResolver) {
    closeConfirmDialog(confirmDialogResults.cancel);
    return;
  }

  if (event.key === "Escape" && !elements.infoDialog.hidden) {
    closeInfoDialog();
    return;
  }

  if (event.key === "Escape" && closeMobileDrawers()) {
    return;
  }

  if (handleNewEntryShortcut(event)) {
    return;
  }

  const isSaveShortcut = (event.ctrlKey || event.metaKey)
    && !event.altKey
    && !event.shiftKey
    && event.key.toLocaleLowerCase() === "s";
  if (!isSaveShortcut) {
    return;
  }

  const inlineForm = partialEditForm();
  if (inlineForm) {
    event.preventDefault();
    inlineForm.requestSubmit();
    return;
  }

  if (state.activeView === "editor" && editorMode === "edit" && !elements.entryForm.hidden) {
    event.preventDefault();
    elements.entryForm.requestSubmit();
    return;
  }

  if (state.activeView === "manager" && !elements.dictionaryForm.hidden) {
    event.preventDefault();
    elements.dictionaryForm.requestSubmit();
    return;
  }

  if (state.activeView === "settings" && !elements.settingsForm.hidden) {
    event.preventDefault();
    elements.settingsForm.requestSubmit();
    return;
  }

  if (state.activeView === "ipa" && !elements.ipaForm.hidden) {
    event.preventDefault();
    elements.ipaForm.requestSubmit();
    return;
  }

  if (state.activeView === "docs" && !elements.docsPanel.hidden) {
    event.preventDefault();
    clearTimeout(docsSaveTimer);
    saveLanguageDocs(true).catch((error) => console.error(error));
    return;
  }

  if (state.activeView === "corpus" && !elements.corpusPanel.hidden) {
    event.preventDefault();
    saveCorpus().catch((error) => console.error(error));
    return;
  }

  if (state.activeView === "morphology-functions" && !elements.morphologyFunctionsForm.hidden) {
    event.preventDefault();
    elements.morphologyFunctionsForm.requestSubmit();
    return;
  }

  if (state.activeView === "morphology-tables" && !elements.morphologyTablesForm.hidden) {
    event.preventDefault();
    elements.morphologyTablesForm.requestSubmit();
  }
});

window.addEventListener("beforeunload", (event) => {
  flushAutomaticModuleSaves();
  if (!hasManualModuleChangesOnExit()) {
    return;
  }
  event.preventDefault();
  event.returnValue = "";
});

window.addEventListener("pagehide", flushAutomaticModuleSaves);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    flushAutomaticModuleSaves();
  }
});

desktopNavMediaQuery.addEventListener("change", () => {
  renderShellNav();
  renderShellEntryBrowser();
  renderMobileAppBar();
  scheduleEntryBrowserLayoutRefresh();
});
wideNavMediaQuery.addEventListener("change", () => {
  renderShellNav();
  renderMobileAppBar();
  scheduleEntryBrowserLayoutRefresh();
});
window.addEventListener("resize", () => {
  renderShellNav();
  renderMobileAppBar();
  scheduleEntryBrowserLayoutRefresh(120);
});
elements.appShell.addEventListener("transitionend", (event) => {
  if (event.propertyName === "grid-template-columns") {
    scheduleEntryBrowserHeightUpdate();
  }
});

hydrateInitialUiPreferences();
applyLocale();
applyTheme();
loadState();
