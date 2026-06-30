let state = {
  activeDictionaryId: "",
  selectedEntryId: "",
  selectedDictionaryConfigId: "",
  activeView: "editor",
  uiLanguage: "zh",
  dictionaries: [],
};

let backendAvailable = true;
let backendMessage = "";
let searchQuery = "";
let activePart = "";
let entrySort = "lemmaAsc";
let toastTimer = null;
let editorMode = "display";
let currentTheme = "light";
let currentLanguage = "zh";
const shellState = {
  navCollapsed: false,
  wideNavCollapsed: false,
  browserCollapsedByView: {},
};
let activeAppTooltipTarget = null;
const desktopNavMediaQuery = window.matchMedia("(min-width: 800px)");
const wideNavMediaQuery = window.matchMedia("(min-width: 1280px)");
const IPA_STRESS_MARKER = "\uE000";
const GLOSS_STYLE_KEYS = ["gla", "glb", "glc", "ft"];
const DEFAULT_ENTRY_EXAMPLE_RENDER_PATTERN = "(\\gla)\n(\\glb)\n(\\glc)\n(\\ft)";
const NO_PART_FILTER_VALUE = "__conlexicon_no_part__";
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
let networkEntryId = "";
let networkOpen = false;
let partialEditSection = "";
let partialEditHost = null;
const expandedMorphologyTables = new Set();
let rootMode = false;
const expandedRootEntries = new Set();
let rootNavigationContextId = "";
let entryDraft = null;
const defaultAnalysisViewState = {
  page: "overview",
  subpageByPage: {
    entries: "tags",
    ipa: "distribution",
    morphology: "tables",
    activity: "updated",
    quality: "issues",
  },
  scrollByRoute: {},
};
const analysisViewStates = new Map();
const corpusViewStates = new Map();
let corpusDraftState = null;
const DEFAULT_TOOL_NAV_ORDER = ["editor", "docs", "corpus", "analysis", "ipa", "morphology", "settings"];
let advancedFilter = null;
let analysisFilterCounter = 0;
const analysisFilterRegistry = new Map();
let draggedToolNavView = "";
let draggedIpaRuleId = "";
const entryVirtualList = createVirtualListState(138);
const corpusVirtualList = createVirtualListState(74);
const masonryLayouts = new WeakMap();

const i18n = {
  zh: {
    appTitle: "人造语言词典",
    toolNavigation: "工具导航",
    collapseNavigation: "收起工具导航",
    expandNavigation: "展开工具导航",
    entryBrowser: "词条列表",
    collapseEntryBrowser: "收起词条列表",
    expandEntryBrowser: "展开词条列表",
    entryEditor: "词条编辑",
    current: "当前",
    planned: "待实装",
    ipaConfig: "自动 IPA 标注",
    analysis: "数据分析",
    languageDocs: "语言文档",
    corpus: "语料库",
    morphologyConfig: "自动形态学",
    morphologyDisplay: "形态学",
    morphologyNeedDictionary: "自动形态学配置会保存到当前词典文件中。",
    morphologyTables: "形态表格",
    morphologyFunctionObjects: "函数识别对象",
    morphologyFunctionObjectsHelp: "为 leftV/rightV 配置它们会识别的对象。函数被规则使用时必须先配置；函数会先找到最近的已配置对象，再判断它是否属于括号中的候选项。多个对象用逗号分隔。",
    morphologyLeftVObjects: "leftV 识别对象",
    morphologyRightVObjects: "rightV 识别对象",
    invalidMorphologyFunctionObjects: "形态配置中存在未配置的函数对象",
    invalidMorphologySyntax: "形态配置中存在不合法的替换语法",
    morphologyTable: "形态表格",
    addMorphologyTable: "添加表格",
    tableName: "表格名称",
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
    morphologyAuto: "自动匹配",
    morphologyNone: "不使用表格",
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
    fuzzySearchHelp: "在词条搜索中启用模糊匹配",
    tagFuzzySearchHelp: "在原始标签和替换后标签中启用模糊匹配",
    sourceFuzzyHelp: "在词源来源补全中启用模糊匹配",
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
    partOfSpeechTagSettings: "词性标签",
    manualPartOfSpeechTags: "手动配置词性标签",
    partOfSpeechTagsHelp: "开启后，仅这里列出的标签会被识别为词性；多个标签用逗号分隔。关闭时仍保留内容，但使用第一个词条标签作为词性。",
    tagOrderSettings: "自动整理标签顺序",
    tagOrderHelp: "输入统一标签顺序，多个标签用逗号分隔。填写原始标签，不填写显示替换后的文本。",
    tagOrderInfo: "查看标签排序逻辑",
    tagOrderInfoBody: "点击刷新后，系统会按输入框中的统一顺序重排每个词条的标签。统一顺序里有而某个词条没有的标签会被跳过；某个词条里有但统一顺序里没有的标签会保留在末尾，多个额外标签保持原始相对顺序。这里应填写原始标签；显示替换只影响界面显示，不参与匹配。",
    tagOrderConfirm: "将按照当前输入的统一顺序重排当前词典中所有词条的标签，并立即保存。继续吗？",
    tagOrderApplied: "标签顺序已整理",
    tagOrderEmpty: "请先输入至少一个标签。",
    applyTags: "应用",
    tagDisplaySettings: "标签突出显示",
    tagRedHighlightHelp: "配置后，这些标签会在词条浏览栏和查看界面中以红色显示。多个标签用逗号、空格或换行分隔。",
    tagFilterSettings: "标签筛选",
    entryListTagFilteringHelp: "在词条列表中点击标签时启用筛选",
    displaySettings: "显示",
    polysemyDisplay: "多义项显示",
    entryListPolysemyDisplay: "词条列表的多义项显示",
    networkPolysemyDisplay: "词汇网络悬浮卡片的多义项显示",
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
    setCurrentDictionary: "设为当前词典",
    saveConfig: "保存配置",
    unnamedDictionary: "未命名词典",
    dictionary: "词典",
    entries: "个词条",
    roots: "个词根",
    noEntries: "还没有词条",
    noEntriesBody: "新建第一个词条后，这里会显示词条详情。",
    noMatch: "没有匹配的词条",
    noMatchBody: "可以新建词条，或调整搜索与筛选条件。",
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
    importOverwriteTitle: "词典 ID 已存在",
    importOverwriteMessage: "词典 ID“{id}”已经存在。导入“{name}”将覆盖现有词典及其全部数据。",
    importAndOverwrite: "导入并覆盖",
    updatedAt: "修订日期",
    source: "来源",
    derivedEntries: "衍生",
    ipaNeedDictionary: "自动 IPA 标注规则会保存到当前词典文件中。",
    orthographyModule: "正写法识别",
    orthographyStressModule: "正写法重音映射",
    mappingRules: "映射规则",
    stressMappings: "重音映射",
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
    duplicateEntityIdsMessage: "以下 ID 被多个条目或语料对象使用，保存或导入已停止：\n{details}",
    entryEntity: "词条",
    corpusBlockFallback: "未命名块",
    corpusLayerFallback: "未命名层",
    corpusUnitFallback: "空单元",
    corpusRequiredBlockTitle: "请填写块标题",
    corpusRequiredUnitContent: "请填写单元内容",
    corpusBlockStats: "{layers} 层 · {units} 单元",
    corpusUnitParentLabel: "父级：{parent}",
    lexicalNetwork: "词汇网络",
    closeNetwork: "关闭网络",
  },
  en: {
    appTitle: "Constructed Language Dictionary",
    toolNavigation: "Tool navigation",
    collapseNavigation: "Collapse tool navigation",
    expandNavigation: "Expand tool navigation",
    entryBrowser: "Entry list",
    collapseEntryBrowser: "Collapse entry list",
    expandEntryBrowser: "Expand entry list",
    entryEditor: "Entries",
    current: "Current",
    planned: "Planned",
    ipaConfig: "Auto IPA",
    analysis: "Analytics",
    languageDocs: "Language Docs",
    corpus: "Corpus",
    morphologyConfig: "Auto Morphology",
    morphologyDisplay: "Morphology",
    morphologyNeedDictionary: "Auto morphology config is saved in the current dictionary file.",
    morphologyTables: "Morphology Tables",
    morphologyFunctionObjects: "Function Recognition Objects",
    morphologyFunctionObjectsHelp: "Configure the objects recognized by leftV/rightV. A function must be configured before rules can use it; the function finds the nearest configured object first, then checks whether it is in the candidates inside parentheses. Separate objects with commas.",
    morphologyLeftVObjects: "leftV Objects",
    morphologyRightVObjects: "rightV Objects",
    invalidMorphologyFunctionObjects: "Morphology config contains unconfigured function objects",
    invalidMorphologySyntax: "Morphology config contains invalid replacement syntax",
    morphologyTable: "Morphology Table",
    addMorphologyTable: "Add Table",
    tableName: "Table Name",
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
    morphologyAuto: "Auto Match",
    morphologyNone: "No Table",
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
    fuzzySearchHelp: "Enable fuzzy matching in entry search",
    tagFuzzySearchHelp: "Enable fuzzy matching for raw and displayed tags",
    sourceFuzzyHelp: "Enable fuzzy matching in etymology source completion",
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
    partOfSpeechTagSettings: "Part-of-Speech Tags",
    manualPartOfSpeechTags: "Manually configure part-of-speech tags",
    partOfSpeechTagsHelp: "When enabled, only tags listed here are recognized as parts of speech. Separate tags with commas. When disabled, the value is kept but the first entry tag is used as the part of speech.",
    tagOrderSettings: "Auto Arrange Tag Order",
    tagOrderHelp: "Enter a unified tag order separated by commas. Use raw tags, not display replacements.",
    tagOrderInfo: "Show tag ordering logic",
    tagOrderInfoBody: "After you click Refresh, each entry's tags are reordered by the unified order in this field. Tags in the unified order that an entry does not have are skipped. Tags on an entry that are not in the unified order are kept at the end, and multiple extra tags keep their original relative order. Use raw tags here; display replacements only affect how tags are shown.",
    tagOrderConfirm: "This will reorder tags for every entry in the current dictionary using the current unified order and save immediately. Continue?",
    tagOrderApplied: "Tag order arranged",
    tagOrderEmpty: "Enter at least one tag first.",
    applyTags: "Apply",
    tagDisplaySettings: "Tag Highlighting",
    tagRedHighlightHelp: "Configured tags are shown in red in the entry browser and display mode. Separate tags with commas, spaces, or line breaks.",
    tagFilterSettings: "Tag Filtering",
    entryListTagFilteringHelp: "Enable filtering when clicking tags in the entry list",
    displaySettings: "Display",
    polysemyDisplay: "Polysemy Display",
    entryListPolysemyDisplay: "Entry list polysemy display",
    networkPolysemyDisplay: "Lexical network hover-card polysemy display",
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
    setCurrentDictionary: "Set Current",
    saveConfig: "Save Config",
    unnamedDictionary: "Untitled Dictionary",
    dictionary: "Dictionary",
    entries: "entries",
    roots: "roots",
    noEntries: "No entries yet",
    noEntriesBody: "Create the first entry to show details here.",
    noMatch: "No matching entries",
    noMatchBody: "Create an entry, or adjust search and filters.",
    noDescription: "No description",
    config: "Configure",
    setCurrent: "Set Current",
    new: "New",
    edit: "Edit",
    entry: "Entry",
    meaning: "Definition",
    example: "Example",
    definitionNote: "Definition Note",
    removeDefinition: "Remove Definition",
    none: "None",
    wholeEntryNote: "Whole Entry Note",
    requiredEntry: "Fill lemma",
    missingDefinition: "No definition yet",
    savedEntry: "Entry saved",
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
    importOverwriteTitle: "Dictionary ID already exists",
    importOverwriteMessage: "Dictionary ID “{id}” already exists. Importing “{name}” will overwrite the existing dictionary and all of its data.",
    importAndOverwrite: "Import and Overwrite",
    updatedAt: "Updated",
    source: "Source",
    derivedEntries: "Derived",
    ipaNeedDictionary: "Auto IPA rules are saved in the current dictionary file.",
    orthographyModule: "Orthography Recognition",
    orthographyStressModule: "Orthographic Stress",
    mappingRules: "Mapping Rules",
    stressMappings: "Stress Mappings",
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
    duplicateEntityIdsMessage: "These IDs are used by multiple entries or corpus objects. Saving or importing has been stopped:\n{details}",
    entryEntity: "Entry",
    corpusBlockFallback: "Untitled Block",
    corpusLayerFallback: "Untitled Layer",
    corpusUnitFallback: "Empty Unit",
    corpusRequiredBlockTitle: "Enter a block title",
    corpusRequiredUnitContent: "Enter unit content",
    corpusBlockStats: "{layers} layers · {units} units",
    corpusUnitParentLabel: "Parent: {parent}",
    lexicalNetwork: "Lexical Network",
    closeNetwork: "Close Network",
  },
};

const elements = {
  appShell: document.querySelector("#appShell"),
  appNav: document.querySelector("#appNav"),
  navCollapseButton: document.querySelector("#navCollapseButton"),
  appTooltip: document.querySelector("#appTooltip"),
  appTooltipTargets: [...document.querySelectorAll("#appNav button, [data-app-tooltip]")],
  editorView: document.querySelector("#editorView"),
  editorTopBar: document.querySelector("#editorTopBar"),
  entryBrowserToggleButton: document.querySelector("#entryBrowserToggleButton"),
  entryBrowser: document.querySelector("#entryBrowser"),
  dictionaryManagerView: document.querySelector("#dictionaryManagerView"),
  analysisView: document.querySelector("#analysisView"),
  settingsView: document.querySelector("#settingsView"),
  docsView: document.querySelector("#docsView"),
  corpusView: document.querySelector("#corpusView"),
  morphologyView: document.querySelector("#morphologyView"),
  ipaView: document.querySelector("#ipaView"),
  dictionaryManagerButton: document.querySelector("#dictionaryManagerButton"),
  backToEditorButton: document.querySelector("#backToEditorButton"),
  backToEditorFromSettingsButton: document.querySelector("#backToEditorFromSettingsButton"),
  backToEditorFromAnalysisButton: document.querySelector("#backToEditorFromAnalysisButton"),
  backToEditorFromDocsButton: document.querySelector("#backToEditorFromDocsButton"),
  backToEditorFromCorpusButton: document.querySelector("#backToEditorFromCorpusButton"),
  backToEditorFromMorphologyButton: document.querySelector("#backToEditorFromMorphologyButton"),
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
  dictionaryManagerList: document.querySelector("#dictionaryManagerList"),
  dictionaryMeta: document.querySelector("#dictionaryMeta"),
  dictionaryTitle: document.querySelector("#dictionaryTitle"),
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
  exportButton: document.querySelector("#exportButton"),
  importInput: document.querySelector("#importInput"),
  entryDisplay: document.querySelector("#entryDisplay"),
  displayLemma: document.querySelector("#displayLemma"),
  displayPronunciation: document.querySelector("#displayPronunciation"),
  displayPart: document.querySelector("#displayPart"),
  displayTags: document.querySelector("#displayTags"),
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
  entryMorphologyTableSelect: document.querySelector("#entryMorphologyTableSelect"),
  entryMorphologyOverrides: document.querySelector("#entryMorphologyOverrides"),
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
  activateDictionaryButton: document.querySelector("#activateDictionaryButton"),
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
  settingsForm: document.querySelector("#settingsForm"),
  glossStyleRows: [...document.querySelectorAll("[data-gloss-style]")],
  corpusUnitCardRenderPatternInput: document.querySelector("#corpusUnitCardRenderPatternInput"),
  corpusUnitCardGlossAlignInput: document.querySelector("#corpusUnitCardGlossAlignInput"),
  corpusUnitRenderPatternInput: document.querySelector("#corpusUnitRenderPatternInput"),
  corpusUnitGlossAlignInput: document.querySelector("#corpusUnitGlossAlignInput"),
  entryExampleRenderPatternInput: document.querySelector("#entryExampleRenderPatternInput"),
  entryExampleGlossAlignInput: document.querySelector("#entryExampleGlossAlignInput"),
  tagDisplayMapInput: document.querySelector("#tagDisplayMapInput"),
  manualPartOfSpeechTagsInput: document.querySelector("#manualPartOfSpeechTagsInput"),
  partOfSpeechTagsInput: document.querySelector("#partOfSpeechTagsInput"),
  tagSortOrderInput: document.querySelector("#tagSortOrderInput"),
  applyTagSortOrderButton: document.querySelector("#applyTagSortOrderButton"),
  tagOrderInfoButton: document.querySelector("#tagOrderInfoButton"),
  tagRedHighlightInput: document.querySelector("#tagRedHighlightInput"),
  entryListTagFilteringInput: document.querySelector("#entryListTagFilteringInput"),
  entryListPolysemyInput: document.querySelector("#entryListPolysemyInput"),
  networkPolysemyInput: document.querySelector("#networkPolysemyInput"),
  fuzzySearchInput: document.querySelector("#fuzzySearchInput"),
  tagFuzzySearchInput: document.querySelector("#tagFuzzySearchInput"),
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
  morphologyNoDictionaryNotice: document.querySelector("#morphologyNoDictionaryNotice"),
  morphologyOpenDictionaryManagerButton: document.querySelector("#morphologyOpenDictionaryManagerButton"),
  morphologyPanel: document.querySelector("#morphologyPanel"),
  morphologyForm: document.querySelector("#morphologyForm"),
  morphologyLeftVObjectsInput: document.querySelector("#morphologyLeftVObjectsInput"),
  morphologyRightVObjectsInput: document.querySelector("#morphologyRightVObjectsInput"),
  morphologyTableList: document.querySelector("#morphologyTableList"),
  addMorphologyTableButton: document.querySelector("#addMorphologyTableButton"),
  morphologySyntaxButton: document.querySelector("#morphologySyntaxButton"),
  morphologySyntaxDialog: document.querySelector("#morphologySyntaxDialog"),
  closeMorphologySyntaxButton: document.querySelector("#closeMorphologySyntaxButton"),
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

function t(key) {
  return i18n[currentLanguage][key] || i18n.zh[key] || key;
}

function normalizeUiLanguage(value) {
  return value === "en" ? "en" : "zh";
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

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `HTTP ${response.status}`);
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
    state = normalizeState({
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
}

function normalizeState(source) {
  return {
    activeDictionaryId: source.activeDictionaryId || "",
    selectedEntryId: source.selectedEntryId || "",
    selectedDictionaryConfigId: source.selectedDictionaryConfigId || source.activeDictionaryId || "",
    activeView: source.activeView || "editor",
    uiLanguage: normalizeUiLanguage(source.uiLanguage),
    dictionaries: Array.isArray(source.dictionaries) ? source.dictionaries.map(normalizeDictionary) : [],
  };
}

function normalizeDictionary(dictionary) {
  const usedEntityIds = new Set(dictionaryEntityIdRecords(dictionary).map(({ id }) => id));
  const entries = Array.isArray(dictionary.entries)
    ? dictionary.entries.map((entry) => normalizeEntry({
      ...entry,
      id: reserveEntityId(entry.id, "entry", usedEntityIds),
    }))
    : [];
  return {
    id: dictionary.id || uid("dict"),
    name: dictionary.name || t("unnamedDictionary"),
    language: dictionary.language || "",
    description: dictionary.description || "",
    settings: normalizeDictionarySettings(dictionary.settings),
    docs: normalizeDocs(dictionary.docs),
    corpus: normalizeCorpus(dictionary.corpus, usedEntityIds),
    morphology: normalizeMorphology(dictionary.morphology),
    createdAt: dictionary.createdAt || new Date().toISOString(),
    updatedAt: dictionary.updatedAt || new Date().toISOString(),
    entries,
  };
}

function normalizeEntry(entry) {
  const tags = Array.isArray(entry.tags) ? entry.tags.filter(Boolean) : [];
  if (entry.partOfSpeech && tags[0] !== entry.partOfSpeech) {
    tags.unshift(entry.partOfSpeech);
  }

  const definitions = Array.isArray(entry.definitions) && entry.definitions.length
    ? entry.definitions.map(normalizeDefinition)
    : [
        normalizeDefinition({
          meaning: entry.meaning || "",
          example: entry.example || "",
          note: "",
        }),
      ];

  const migratedEtymology = [entry.roots, entry.variant].filter(Boolean).join("\n");
  const sourceText = entry.etymology?.sourceText || entry.etymology?.source || "";
  const sources = Array.isArray(entry.etymology?.sources)
    ? entry.etymology.sources.map(String).map((item) => item.trim()).filter(Boolean)
    : splitSourceText(sourceText);
  if (entry.etymology?.sourceEntryId && !sources.includes(entry.etymology.sourceEntryId)) {
    sources.push(entry.etymology.sourceEntryId);
  }

  return {
    id: entry.id || uid("entry"),
    lemma: entry.lemma || "",
    pronunciation: entry.pronunciation || "",
    tags,
    definitions,
    etymology: {
      sources,
      description: entry.etymology?.description || migratedEtymology,
    },
    notes: entry.notes || "",
    morphology: normalizeEntryMorphology(entry.morphology),
    createdAt: entry.createdAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || new Date().toISOString(),
  };
}

function normalizeDefinition(definition = {}) {
  return {
    id: definition.id || uid("def"),
    meaning: definition.meaning || "",
    example: definition.example || "",
    note: definition.note || "",
  };
}

function normalizeDictionarySettings(settings = {}) {
  const {
    glossSmallCaps,
    glossFontFamily,
    glossFont,
    corpusGlossAlign,
    savePartialEditOnSwitch,
    saveFullEditOnSwitch,
    savePartialEditOnPageSwitch,
    saveFullEditOnPageSwitch,
    ...restSettings
  } = settings;

  return {
    ...restSettings,
    glossStyles: normalizeGlossStyles(settings.glossStyles, glossFontFamily || glossFont, glossSmallCaps),
    corpusUnitCardRenderPattern: String(settings.corpusUnitCardRenderPattern ?? settings.corpusUnitRenderPattern ?? ""),
    corpusUnitCardGlossAlign: Boolean(settings.corpusUnitCardGlossAlign ?? corpusGlossAlign ?? true),
    corpusUnitRenderPattern: String(settings.corpusUnitRenderPattern || ""),
    corpusUnitGlossAlign: Boolean(settings.corpusUnitGlossAlign ?? corpusGlossAlign ?? true),
    entryExampleRenderPattern: String(settings.entryExampleRenderPattern ?? DEFAULT_ENTRY_EXAMPLE_RENDER_PATTERN),
    entryExampleGlossAlign: Boolean(settings.entryExampleGlossAlign ?? true),
    corpusAutoSave: Boolean(settings.corpusAutoSave ?? true),
    docsAutoSave: Boolean(settings.docsAutoSave ?? true),
    tagDisplayMap: normalizeTagDisplayMap(settings.tagDisplayMap),
    manualPartOfSpeechTags: Boolean(settings.manualPartOfSpeechTags),
    partOfSpeechTags: normalizeTagList(settings.partOfSpeechTags),
    tagSortOrder: normalizeTagList(settings.tagSortOrder),
    redHighlightTags: normalizeRedHighlightTags(settings.redHighlightTags),
    entryListTagFiltering: Boolean(settings.entryListTagFiltering ?? true),
    entryListPolysemyDisplay: Boolean(settings.entryListPolysemyDisplay),
    networkPolysemyDisplay: Boolean(settings.networkPolysemyDisplay),
    fuzzySearch: Boolean(settings.fuzzySearch),
    tagFuzzySearch: Boolean(settings.tagFuzzySearch),
    sourceFuzzyCompletion: Boolean(settings.sourceFuzzyCompletion),
    searchHighlight: Boolean(settings.searchHighlight ?? true),
    partialEditPageSwitchAction: normalizeEditPageSwitchAction(
      settings.partialEditPageSwitchAction,
      savePartialEditOnPageSwitch ?? savePartialEditOnSwitch,
    ),
    fullEditPageSwitchAction: normalizeEditPageSwitchAction(
      settings.fullEditPageSwitchAction,
      saveFullEditOnPageSwitch ?? saveFullEditOnSwitch,
    ),
    allowEmptyPronunciation: Boolean(settings.allowEmptyPronunciation ?? true),
    allowEmptyTags: Boolean(settings.allowEmptyTags ?? true),
    allowEmptyDefinitions: Boolean(settings.allowEmptyDefinitions ?? true),
    ipaKeyboard: normalizeIpaKeyboard(settings.ipaKeyboard),
    ipa: normalizeIpaSettings(settings.ipa),
    toolNavOrder: normalizeToolNavOrder(settings.toolNavOrder),
  };
}

function normalizeEditPageSwitchAction(value, legacySaveValue = false) {
  return ["save", "discard", "prompt"].includes(value)
    ? value
    : (legacySaveValue ? "save" : "discard");
}

function normalizeGlossFontFamily(value) {
  return ["serif", "sans", "mono"].includes(value) ? value : "serif";
}

function normalizeGlossFontSize(value) {
  return ["small", "medium", "large"].includes(value) ? value : "medium";
}

function normalizeGlossStyles(styles = {}, legacyFontFamily = "serif", legacySmallCaps = false) {
  const fallbackFont = normalizeGlossFontFamily(legacyFontFamily);
  return Object.fromEntries(GLOSS_STYLE_KEYS.map((key) => {
    const style = styles?.[key] && typeof styles[key] === "object" ? styles[key] : {};
    return [key, {
      fontFamily: normalizeGlossFontFamily(style.fontFamily || fallbackFont),
      fontSize: normalizeGlossFontSize(style.fontSize),
      bold: Boolean(style.bold),
      italic: Boolean(style.italic ?? (key === "ft")),
      ...(key === "glb" ? { smallCaps: Boolean(style.smallCaps ?? legacySmallCaps) } : {}),
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

function toolNavLabel(view) {
  const labels = {
    editor: t("entryEditor"),
    docs: t("languageDocs"),
    corpus: t("corpus"),
    analysis: t("analysis"),
    ipa: t("ipaConfig"),
    morphology: t("morphologyConfig"),
    settings: t("otherSettings"),
  };
  return labels[view] || view;
}

function normalizeTagDisplayMap(map = {}) {
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(map)
      .map(([key, value]) => [String(key).trim(), String(value).trim()])
      .filter(([key, value]) => key && value),
  );
}

function normalizeRedHighlightTags(value) {
  const items = Array.isArray(value)
    ? value.map(String)
    : String(value || "").split(/[\s,，、]+/);
  const unique = [];
  items
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      if (!unique.includes(item)) {
        unique.push(item);
      }
  });
  return unique;
}

function normalizeTagList(value) {
  const items = Array.isArray(value) ? value.map(String) : splitList(value);
  const unique = [];
  items
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      if (!unique.includes(item)) {
        unique.push(item);
      }
  });
  return unique;
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
    title: String(block.title || block.name || ""),
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
    content: String(unit.content || unit.text || ""),
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

function normalizeMorphology(morphology = {}) {
  return {
    functions: normalizeMorphologyFunctions(morphology.functions),
    tables: Array.isArray(morphology.tables) ? morphology.tables.map(normalizeMorphologyTable) : [],
  };
}

function normalizeMorphologyFunctions(functions = {}) {
  return {
    leftV: uniqueList(functions.leftV),
    rightV: uniqueList(functions.rightV),
  };
}

function uniqueList(value) {
  const items = Array.isArray(value) ? value.map(String) : splitList(value);
  const unique = [];
  items
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      if (!unique.includes(item)) {
        unique.push(item);
      }
    });
  return unique;
}

function normalizeMorphologyTable(table = {}) {
  const rows = Math.max(1, Number.parseInt(table.rows, 10) || 2);
  const cols = Math.max(1, Number.parseInt(table.cols, 10) || 2);
  const rowLabels = Array.from({ length: rows }, (_, index) => String(table.rowLabels?.[index] || `${index + 1}`));
  const colLabels = Array.from({ length: cols }, (_, index) => String(table.colLabels?.[index] || `${index + 1}`));
  const cells = {};
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const key = morphologyCellKey(row, col);
      cells[key] = normalizeMorphologyCell(table.cells?.[key]);
    }
  }
  return {
    id: table.id || uid("morph"),
    name: String(table.name || t("morphologyTable")),
    rows,
    cols,
    rowLabels,
    colLabels,
    matchTags: splitList(Array.isArray(table.matchTags) ? table.matchTags.join("，") : table.matchTags || ""),
    cells,
  };
}

function normalizeMorphologyCell(cell = {}) {
  return {
    mode: cell.mode === "replace" ? "replace" : "reference",
    value: String(cell.value || ""),
  };
}

function normalizeEntryMorphology(morphology = {}) {
  return {
    tableId: morphology.tableId || "auto",
    overrides: normalizeMorphologyOverrides(morphology.overrides),
  };
}

function normalizeMorphologyOverrides(overrides = {}) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(overrides)
      .map(([key, value]) => [key, String(value || "").trim()])
      .filter(([, value]) => value),
  );
}

function morphologyCellKey(row, col) {
  return `${row},${col}`;
}

function normalizeIpaKeyboard(symbols) {
  const parsed = Array.isArray(symbols)
    ? symbols.map(String)
    : splitKeyboardSymbols(symbols || "ˈ ˌ");
  const unique = [];
  parsed
    .map((symbol) => symbol.trim())
    .filter(Boolean)
    .forEach((symbol) => {
      if (!unique.includes(symbol)) {
        unique.push(symbol);
      }
    });
  return unique.length ? unique : ["ˈ", "ˌ"];
}

function splitKeyboardSymbols(value) {
  return String(value || "")
    .split(/[\s,，、]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeIpaSettings(ipa = {}) {
  const defaultStress = Number.parseInt(ipa.defaultStress, 10);
  const mappings = [
    ...normalizeIpaRuleList(ipa.mappings),
    ...normalizeIpaRuleList(ipa.stressMappings).map((rule) => ({
      ...rule,
      to: hasStressOutput(rule.to) ? rule.to : `ˈ${rule.to || rule.from}`,
    })),
  ];
  return {
    mappings,
    syllable: {
      vowels: ipa.syllable?.vowels || "aeiouAEIOU",
      separator: ipa.syllable?.separator || ".",
      onsetClusters: normalizeClusterList(ipa.syllable?.onsetClusters),
      codaClusters: normalizeClusterList(ipa.syllable?.codaClusters),
      complexPhonemes: normalizeClusterList(ipa.syllable?.complexPhonemes),
    },
    defaultStress: Number.isInteger(defaultStress) ? defaultStress : -2,
    unstressMonosyllables: Boolean(ipa.unstressMonosyllables),
  };
}

function normalizeClusterList(value) {
  const clusters = Array.isArray(value) ? value : String(value || "").split(/[,，、]/);
  return [...new Set(clusters.map((cluster) => String(cluster).trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
}

function normalizeOnsetClusters(value) {
  return normalizeClusterList(value);
}

function hasStressOutput(value) {
  const output = String(value || "");
  return output.startsWith("'") || output.includes("ˈ");
}

function normalizeIpaRuleList(rules) {
  return Array.isArray(rules)
    ? rules.map(normalizeIpaRule).filter((rule) => rule.from || rule.to || rule.before || rule.after)
    : [];
}

function normalizeIpaRule(rule = {}) {
  return {
    id: rule.id || uid("ipa"),
    from: String(rule.from || ""),
    to: String(rule.to || ""),
    before: String(rule.before || ""),
    after: String(rule.after || ""),
  };
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
  return [
    ...(dictionary.entries || []).map((entry) => ({
      id: String(entry.id || "").trim(),
      typeKey: "entryEntity",
    })),
    ...corpusEntityIdRecords(dictionary.corpus),
  ].filter((record) => record.id);
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
  return dictionary?.entries.find((entry) => entry.id === state.selectedEntryId) || null;
}

function selectedDictionaryConfig() {
  return state.dictionaries.find((dictionary) => dictionary.id === state.selectedDictionaryConfigId) || null;
}

function entryPart(entry) {
  return entryParts(entry)[0] || "";
}

function entryParts(entry, dictionary = activeDictionary()) {
  const tags = entry?.tags || [];
  if (!tags.length) {
    return [];
  }
  const settings = normalizeDictionarySettings(dictionary?.settings);
  if (!settings.manualPartOfSpeechTags) {
    return tags[0] ? [tags[0]] : [];
  }
  const configuredParts = new Set(settings.partOfSpeechTags.map(normalize));
  if (!configuredParts.size) {
    return [];
  }
  return tags.filter((tag) => configuredParts.has(normalize(tag)));
}

function entryPartLabels(entry, dictionary = activeDictionary()) {
  return entryParts(entry, dictionary).map((part) => displayTag(part, dictionary));
}

function entryPartText(entry, dictionary = activeDictionary()) {
  return entryPartLabels(entry, dictionary).join(", ");
}

function entryTagIsPart(entry, tagIndex, tag, dictionary = activeDictionary()) {
  const settings = normalizeDictionarySettings(dictionary?.settings);
  if (!settings.manualPartOfSpeechTags) {
    return tagIndex === 0;
  }
  return entryParts(entry, dictionary).some((part) => normalize(part) === normalize(tag));
}

function displayTag(tag, dictionary = activeDictionary()) {
  const value = String(tag || "");
  return dictionary?.settings?.tagDisplayMap?.[value] || value;
}

function tagIsRedHighlighted(tag, dictionary = activeDictionary()) {
  const settings = normalizeDictionarySettings(dictionary?.settings);
  const candidates = new Set(settings.redHighlightTags.map(normalize));
  return candidates.has(normalize(tag)) || candidates.has(normalize(displayTag(tag, dictionary)));
}

function normalize(value) {
  return String(value || "").trim().toLocaleLowerCase(currentLanguage === "zh" ? "zh-CN" : "en-US");
}

function splitList(value) {
  return String(value || "")
    .split(/[,\n，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitSourceText(value) {
  return String(value || "")
    .split(/[,，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function render() {
  ensureValidSelection();
  applyLocale();
  applyTheme();
  renderShellNav();
  renderView();
  renderAvailability();
  renderShellEntryBrowser();
  renderHeader();
  renderToolNav();
  renderActiveView();
  restoreProcessScroll();
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
  if (state.activeView === "morphology") {
    renderMorphologyConfig(dictionary);
    return;
  }
  if (state.activeView === "ipa") {
    fillIpaForm(dictionary);
    renderIpaSandbox();
    return;
  }
  if (state.activeView === "analysis") {
    renderAnalysis(dictionary);
  }
}

function rememberProcessScroll() {
  if (state.activeView === "docs") {
    viewScrollMemory.docsPage = window.scrollY;
  } else if (state.activeView === "analysis") {
    const analysisViewState = activeAnalysisViewState();
    analysisViewState.scrollByRoute[analysisRouteKey()] = window.scrollY;
  }
}

function restoreProcessScroll() {
  if (state.activeView !== "docs" && state.activeView !== "analysis") {
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

  if (!["editor", "manager", "analysis", "settings", "docs", "corpus", "morphology", "ipa"].includes(state.activeView)) {
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
  document.querySelectorAll("[data-i18n-title]").forEach((node) => {
    const text = t(node.dataset.i18nTitle);
    node.title = text;
    node.setAttribute("aria-label", text);
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
  elements.themeToggleButton.title = nextThemeLabel;
  elements.themeToggleButton.setAttribute("aria-label", nextThemeLabel);
  const nextLanguageLabel = currentLanguage === "zh" ? "English" : "中文";
  elements.languageToggleButton.title = nextLanguageLabel;
  elements.languageToggleButton.setAttribute("aria-label", nextLanguageLabel);
}

function applyTheme() {
  document.body.classList.toggle("dark-theme", currentTheme === "dark");
}

function effectiveNavCollapsed() {
  if (!desktopNavMediaQuery.matches) {
    return false;
  }
  return wideNavMediaQuery.matches ? shellState.wideNavCollapsed : true;
}

function renderShellNav() {
  hideAppTooltip();
  const collapsed = effectiveNavCollapsed();
  shellState.navCollapsed = collapsed;
  const navState = collapsed ? "rail" : "expanded";
  elements.appShell.dataset.navState = navState;
  elements.appNav.dataset.navState = navState;
  elements.navCollapseButton.hidden = !wideNavMediaQuery.matches;
  elements.navCollapseButton.setAttribute("aria-expanded", String(!collapsed));
  const controlLabel = t(collapsed ? "expandNavigation" : "collapseNavigation");
  elements.navCollapseButton.setAttribute("aria-label", controlLabel);
  elements.appTooltipTargets.forEach((button) => {
    if (elements.appNav.contains(button)) {
      button.removeAttribute("title");
    }
  });
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
  elements.appTooltip.textContent = label;
  elements.appTooltip.classList.toggle("wrap", target.dataset.appTooltipWrap === "true");
  elements.appTooltip.hidden = false;
  target.setAttribute("aria-describedby", "appTooltip");
  requestAnimationFrame(() => {
    if (activeAppTooltipTarget !== target || elements.appTooltip.hidden) {
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
  elements.appTooltip.hidden = true;
}

function effectiveEntryBrowserCollapsed(view = state.activeView) {
  return desktopNavMediaQuery.matches
    && view === "editor"
    && Boolean(shellState.browserCollapsedByView[view]);
}

function renderShellEntryBrowser() {
  hideAppTooltip();
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
}

function remeasureEntryVirtualList() {
  const container = entryVirtualList.container;
  if (!container || container.offsetParent === null) {
    return;
  }
  const anchor = virtualListAnchor(entryVirtualList);
  entryVirtualList.sizes.clear();
  entryVirtualList.width = Math.round(container.clientWidth);
  rebuildVirtualListOffsets(entryVirtualList);
  restoreVirtualListAnchor(entryVirtualList, anchor);
  renderVirtualListWindow(entryVirtualList);
}

function toggleEntryBrowser() {
  const view = "editor";
  shellState.browserCollapsedByView[view] = !effectiveEntryBrowserCollapsed(view);
  renderShellEntryBrowser();
  if (!effectiveEntryBrowserCollapsed(view)) {
    requestAnimationFrame(remeasureEntryVirtualList);
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
  elements.docsNoDictionaryNotice.hidden = !backendAvailable || hasDictionary || state.activeView !== "docs";
  elements.docsPanel.hidden = !backendAvailable || !hasDictionary || state.activeView !== "docs";
  elements.saveDocsButton.hidden = !backendAvailable || !hasDictionary || state.activeView !== "docs" || settings.docsAutoSave;
  elements.corpusNoDictionaryNotice.hidden = !backendAvailable || hasDictionary || state.activeView !== "corpus";
  elements.corpusPanel.hidden = !backendAvailable || !hasDictionary || state.activeView !== "corpus";
  elements.saveCorpusButton.hidden = !backendAvailable || !hasDictionary || state.activeView !== "corpus" || settings.corpusAutoSave;
  elements.morphologyNoDictionaryNotice.hidden = !backendAvailable || hasDictionary || state.activeView !== "morphology";
  elements.morphologyPanel.hidden = !backendAvailable || !hasDictionary || state.activeView !== "morphology";
  elements.ipaNoDictionaryNotice.hidden = !backendAvailable || hasDictionary || state.activeView !== "ipa";
  elements.ipaPanel.hidden = !backendAvailable || !hasDictionary || state.activeView !== "ipa";
  elements.batchIpaAllButton.disabled = !backendAvailable || !hasDictionary;
  elements.batchIpaMissingButton.disabled = !backendAvailable || !hasDictionary;
  elements.editorTopBar.hidden = !backendAvailable || !hasDictionary;
  elements.contentGrid.hidden = !backendAvailable || !hasDictionary;
  elements.toolList.hidden = !backendAvailable || !hasDictionary;
  elements.managerGrid.hidden = !backendAvailable;
  elements.newEntryButton.hidden = !backendAvailable || !hasDictionary;
  elements.addDictionaryButton.disabled = !backendAvailable;
  elements.exportButton.disabled = !backendAvailable || !hasDictionary;
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
  elements.settingsView.classList.toggle("active", state.activeView === "settings");
  elements.docsView.classList.toggle("active", state.activeView === "docs");
  elements.corpusView.classList.toggle("active", state.activeView === "corpus");
  elements.morphologyView.classList.toggle("active", state.activeView === "morphology");
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
  elements.dictionaryManagerButton.hidden = state.activeView === "manager";
  elements.toolButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.activeView);
  });
}

function renderHeader() {
  const dictionary = activeDictionary();
  elements.newEntryButton.disabled = !dictionary;

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
  const usedParts = dictionary
    ? [...new Set(dictionary.entries.flatMap((entry) => entryParts(entry, dictionary)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"))
    : [];
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
  const hasRootSearch = Boolean(normalize(searchQuery));
  elements.expandAllRootsButton.disabled = rootMode && hasRootSearch;
  elements.collapseAllRootsButton.disabled = rootMode && hasRootSearch;
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
  virtualList.container = container;
  virtualList.scrollHandler = () => scheduleVirtualListRender(virtualList);
  container.addEventListener("scroll", virtualList.scrollHandler, { passive: true });
  if (typeof ResizeObserver === "undefined") {
    return;
  }
  virtualList.resizeObserver = new ResizeObserver((entries) => {
    const anchor = virtualListAnchor(virtualList);
    let changed = false;
    entries.forEach((entry) => {
      const key = entry.target.dataset.virtualKey;
      const height = entry.borderBoxSize?.[0]?.blockSize || entry.target.getBoundingClientRect().height;
      if (key && height > 0 && Math.abs((virtualList.sizes.get(key) || 0) - height) > 0.5) {
        virtualList.sizes.set(key, height);
        changed = true;
      }
    });
    if (!changed) {
      return;
    }
    rebuildVirtualListOffsets(virtualList);
    restoreVirtualListAnchor(virtualList, anchor);
    clampVirtualListScroll(virtualList);
    scheduleVirtualListRender(virtualList);
  });
  virtualList.viewportObserver = new ResizeObserver((entries) => {
    const width = Math.round(entries[0]?.contentRect?.width || container.clientWidth);
    if (virtualList.width && width && width !== virtualList.width) {
      virtualList.sizes.clear();
      rebuildVirtualListOffsets(virtualList);
    }
    virtualList.width = width;
    scheduleVirtualListRender(virtualList);
  });
  virtualList.viewportObserver.observe(container);
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
  const index = virtualListIndexAt(virtualList.offsets, virtualList.container.scrollTop);
  return {
    key: virtualList.items[index]?.key || "",
    offset: virtualList.container.scrollTop - virtualList.offsets[index],
  };
}

function restoreVirtualListAnchor(virtualList, anchor) {
  if (!anchor?.key || !virtualList.container) {
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
    renderVirtualListWindow(virtualList);
  });
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
}

function renderVirtualList(container, virtualList, items, options) {
  initializeVirtualList(virtualList, container);
  container.classList.add("virtualized-list");
  const resetScroll = virtualList.resetToken !== options.resetToken;
  virtualList.resetToken = options.resetToken;
  virtualList.renderItem = options.renderItem;
  virtualList.items = items.map((value) => ({
    key: String(options.getKey(value)),
    estimatedHeight: options.getEstimatedHeight?.(value) || virtualList.estimatedItemHeight,
    value,
  }));
  virtualList.indexByKey = new Map(virtualList.items.map((item, index) => [item.key, index]));
  if (resetScroll) {
    virtualList.sizes.clear();
  }
  rebuildVirtualListOffsets(virtualList);
  if (resetScroll) {
    container.scrollTop = 0;
  }
  clampVirtualListScroll(virtualList);
  renderVirtualListWindow(virtualList);
}

function renderVirtualListEmpty(container, virtualList, content) {
  initializeVirtualList(virtualList, container);
  virtualList.resizeObserver?.disconnect();
  virtualList.items = [];
  virtualList.indexByKey.clear();
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

function renderEntries() {
  if (!activeDictionary()) {
    renderVirtualListEmpty(elements.entryList, entryVirtualList, emptyState(t("noDictionary"), t("emptyDictionaryBody")));
    return;
  }

  if (!advancedFilter && rootMode) {
    renderRootModeEntries();
    return;
  }

  const entries = filteredEntries();
  if (!entries.length) {
    renderVirtualListEmpty(elements.entryList, entryVirtualList, emptyState(t("noMatch"), t("noMatchBody")));
    return;
  }

  const rows = entries.map((entry) => ({ kind: "entry", entry }));
  renderVirtualList(elements.entryList, entryVirtualList, rows, {
    resetToken: entryVirtualResetToken(),
    getKey: (row) => `entry:${row.entry.id}`,
    getEstimatedHeight: (row) => estimateEntryCardHeight(row.entry),
    renderItem: (row) => createEntryCard(row.entry, { qualityIssues: advancedFilterIssuesForEntry(row.entry.id) }),
  });
}

function renderRootModeEntries() {
  const groups = rootModeGroups();
  if (!groups.length) {
    renderVirtualListEmpty(elements.entryList, entryVirtualList, emptyState(t("noMatch"), t("noMatchBody")));
    return;
  }

  const rows = [];
  groups.forEach((group) => {
    const expanded = expandedRootEntries.has(group.root.id) || Boolean(searchQuery && group.matchedDerived.length);
    rows.push({ kind: "root", group, expanded });
    if (expanded) {
      group.derived.forEach((entry) => rows.push({ kind: "derived", entry, rootId: group.root.id }));
    }
  });
  renderVirtualList(elements.entryList, entryVirtualList, rows, {
    resetToken: entryVirtualResetToken(),
    getKey: (row) => row.kind === "root" ? `root:${row.group.root.id}` : `derived:${row.rootId}:${row.entry.id}`,
    getEstimatedHeight: (row) => row.kind === "root" ? 156 : 116,
    renderItem: renderRootModeRow,
  });
}

function entryVirtualResetToken() {
  return [
    state.activeDictionaryId,
    rootMode ? "root" : "entries",
    normalize(searchQuery),
    activePart,
    entrySort,
    advancedFilter?.title || "",
    advancedFilter?.variantIndex ?? "",
  ].join("|");
}

function renderRootModeRow(row) {
  if (row.kind === "derived") {
    const wrapper = document.createElement("div");
    wrapper.className = "root-derived-list virtual-root-derived-row";
    wrapper.dataset.rootId = row.rootId;
    wrapper.append(createEntryCard(row.entry, { derived: true, rootId: row.rootId }));
    return wrapper;
  }
  const { group, expanded } = row;
  const wrapper = document.createElement("article");
  wrapper.className = "root-entry-group";
  wrapper.dataset.rootId = group.root.id;
  wrapper.append(createEntryCard(group.root, { root: true, rootId: group.root.id }));
  if (group.derived.length) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = `root-toggle-button${expanded ? " expanded" : ""}`;
    toggle.title = expanded ? t("collapse") : t("expand");
    toggle.setAttribute("aria-label", expanded ? t("collapse") : t("expand"));
    toggle.innerHTML = '<span class="chevron-icon" aria-hidden="true"></span>';
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      rootNavigationContextId = group.root.id;
      if (expandedRootEntries.has(group.root.id)) {
        expandedRootEntries.delete(group.root.id);
      } else {
        expandedRootEntries.add(group.root.id);
      }
      renderEntries();
    });
    wrapper.append(toggle);
  }
  return wrapper;
}

function createEntryCard(entry, options = {}) {
  const partText = entryPartText(entry);
  const settings = normalizeDictionarySettings(activeDictionary()?.settings);
  const contentFuzzyEnabled = Boolean(settings.fuzzySearch);
  const tagFuzzyEnabled = Boolean(settings.tagFuzzySearch);
  const subtitle = [
    entry.pronunciation ? highlightSearchText(entry.pronunciation, contentFuzzyEnabled) : "",
    partText ? highlightSearchText(partText, tagFuzzyEnabled) : "",
  ].filter(Boolean).join(" · ");
  const meaningSummary = entryDefinitionSummary(entry, settings.entryListPolysemyDisplay);
  const searchSnippets = renderEntrySearchSnippets(entry);
  const chipHtml = renderChips(entry, 3, true, tagFuzzyEnabled, settings.entryListTagFiltering);
  const qualityIssueHtml = renderEntryQualityIssueBadges(options.qualityIssues || []);
  const compactEntryCard = shouldUseCompactEntryCard(entry, { meaningSummary, searchSnippets });
  const footerHtml = [
    chipHtml ? `<div class="chip-row">${chipHtml}</div>` : "",
    qualityIssueHtml,
  ].filter(Boolean).join("");
  const button = document.createElement("button");
  button.type = "button";
  button.className = [
    "entry-card",
    entry.id === state.selectedEntryId ? "active" : "",
    options.root ? "root-card" : "",
    options.derived ? "derived-entry-card" : "",
    compactEntryCard ? "compact-entry-card" : "",
  ].filter(Boolean).join(" ");
  button.dataset.entryId = entry.id;
  if (options.rootId) {
    button.dataset.rootId = options.rootId;
  }
  button.innerHTML = `
    <div class="entry-card-header">
      <strong>${highlightSearchText(entry.lemma, contentFuzzyEnabled)}</strong>
      <small>${subtitle}</small>
    </div>
    <div class="entry-card-body">
      ${meaningSummary ? `<p>${highlightSearchText(meaningSummary, contentFuzzyEnabled)}</p>` : ""}
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
    beginDerivedEntry(entry);
  });
  return button;
}

function shouldUseCompactEntryCard(entry, options = {}) {
  const settings = normalizeDictionarySettings(activeDictionary()?.settings);
  const meaningSummary = options.meaningSummary ?? entryDefinitionSummary(entry, settings.entryListPolysemyDisplay);
  const searchSnippets = options.searchSnippets ?? renderEntrySearchSnippets(entry);
  return !meaningSummary && !searchSnippets;
}

function estimateEntryCardHeight(entry) {
  return shouldUseCompactEntryCard(entry) ? 86 : entryVirtualList.estimatedItemHeight;
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
  return (entry.definitions || [])
    .map((definition) => String(definition.meaning || "").trim())
    .filter(Boolean);
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

  const targetEntry = dictionary.entries.find((entry) => entry.id === entryId);
  if (!targetEntry) {
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
  render();
  scheduleEntryCardScroll(entryId, navigationOptions);
}

function prepareRootModeEntryNavigation(entryId, options = {}) {
  if (!rootMode || advancedFilter) {
    return options;
  }

  const matchingGroups = rootModeGroups()
    .filter((group) => group.root.id === entryId || group.derived.some((entry) => entry.id === entryId));
  if (!matchingGroups.length) {
    return options;
  }

  const requestedGroup = options.rootId
    ? matchingGroups.find((group) => group.root.id === options.rootId)
    : null;
  const contextGroup = rootNavigationContextId
    ? matchingGroups.find((group) => group.root.id === rootNavigationContextId)
    : null;
  const expandedGroup = matchingGroups.find((group) => expandedRootEntries.has(group.root.id));
  const targetGroup = requestedGroup || contextGroup || expandedGroup || matchingGroups[0];
  const isDerivedEntry = targetGroup.root.id !== entryId;

  rootNavigationContextId = targetGroup.root.id;
  if (isDerivedEntry) {
    expandedRootEntries.add(targetGroup.root.id);
  }
  return { ...options, rootId: targetGroup.root.id };
}

function scheduleEntryCardScroll(entryId, options = {}) {
  if (!entryId) {
    return;
  }
  requestAnimationFrame(() => {
    let key = `entry:${entryId}`;
    if (rootMode && !advancedFilter) {
      key = options.rootId && options.rootId !== entryId
        ? `derived:${options.rootId}:${entryId}`
        : `root:${options.rootId || entryId}`;
    }
    if (scrollVirtualListItemIntoView(entryVirtualList, key)) {
      return;
    }
    const row = entryVirtualList.items.find((item) => item.value?.entry?.id === entryId || item.value?.group?.root?.id === entryId);
    if (row) {
      scrollVirtualListItemIntoView(entryVirtualList, row.key);
    }
  });
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
    }

    if (state.activeView === "editor" && editorMode === "edit" && !elements.entryForm.hidden) {
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

  const query = normalize(searchQuery);
  const settings = normalizeDictionarySettings(dictionary?.settings);
  const contentFuzzyEnabled = Boolean(settings.fuzzySearch);
  const tagFuzzyEnabled = Boolean(settings.tagFuzzySearch);

  return [...dictionary.entries]
    .filter((entry) => entryMatchesSearch(entry, dictionary, { query, contentFuzzyEnabled, tagFuzzyEnabled, respectPart: true }))
    .sort(compareEntries);
}

function entryViewSnapshot() {
  return {
    rootMode,
    activePart,
    entrySort,
    searchQuery,
    expandedRootEntries: [...expandedRootEntries],
  };
}

function restoreEntryViewSnapshot(snapshot = {}) {
  rootMode = Boolean(snapshot.rootMode);
  activePart = snapshot.activePart || "";
  entrySort = snapshot.entrySort || "lemmaAsc";
  searchQuery = snapshot.searchQuery || "";
  expandedRootEntries.clear();
  (snapshot.expandedRootEntries || []).forEach((id) => expandedRootEntries.add(id));
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
    renderPartFilter();
    renderEntries();
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
      buildDictionaryAnalysis(dictionary),
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
      buildDictionaryAnalysis(dictionary),
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
  render();
  scheduleEntryCardScroll(state.selectedEntryId);
}

function entryMatchesSearch(entry, dictionary = activeDictionary(), options = {}) {
  const query = options.query ?? normalize(searchQuery);
  const settings = normalizeDictionarySettings(dictionary?.settings);
  const contentFuzzyEnabled = options.contentFuzzyEnabled ?? Boolean(settings.fuzzySearch);
  const tagFuzzyEnabled = options.tagFuzzyEnabled ?? Boolean(settings.tagFuzzySearch);
  const respectPart = options.respectPart ?? true;
  const parts = entryParts(entry, dictionary);
  const matchesPart = !respectPart
    || !activePart
    || (activePart === NO_PART_FILTER_VALUE ? !parts.length : parts.includes(activePart));
  const tagSearchable = [
    ...parts,
    ...parts.map((part) => displayTag(part, dictionary)),
    ...(entry.tags || []),
    ...(entry.tags || []).map((tag) => displayTag(tag, dictionary)),
  ]
    .map(normalize)
    .join(" ");
  const contentSearchable = [
    entry.lemma,
    entry.pronunciation,
    entry.notes,
    entry.etymology?.description,
    ...entry.definitions.flatMap((definition) => [definition.meaning, definition.example, definition.note]),
    ...morphologySearchStrings(entry, dictionary),
  ]
    .map(normalize)
    .join(" ");
  return matchesPart && (
    !query ||
    textMatches(tagSearchable, query, tagFuzzyEnabled) ||
    textMatches(contentSearchable, query, contentFuzzyEnabled)
  );
}

function dictionaryStatsText(dictionary) {
  if (!dictionary) {
    return "";
  }
  return `${dictionary.entries.length} ${t("entries")} · ${dictionaryRootCount(dictionary)} ${t("roots")}`;
}

function dictionaryRootCount(dictionary) {
  return rootModeGroups(dictionary, { query: "" }).length;
}

function rootModeGroups(dictionary = activeDictionary(), options = {}) {
  if (!dictionary) {
    return [];
  }
  const query = normalize(options.query ?? searchQuery);
  const settings = normalizeDictionarySettings(dictionary.settings);
  const matchOptions = {
    query,
    contentFuzzyEnabled: Boolean(settings.fuzzySearch),
    tagFuzzyEnabled: Boolean(settings.tagFuzzySearch),
    respectPart: false,
  };
  const entries = [...dictionary.entries].sort(compareEntries);
  const groups = new Map();

  entries.forEach((entry) => {
    if (!entryHasSources(entry)) {
      ensureRootGroup(groups, entry);
    }
  });

  entries.forEach((entry) => {
    if (!entryHasSources(entry)) {
      return;
    }
    const roots = sourceRootEntries(entry, dictionary);
    if (!roots.length) {
      ensureRootGroup(groups, entry);
      return;
    }
    roots.forEach((root) => {
      const group = ensureRootGroup(groups, root);
      if (!group.derived.some((item) => item.id === entry.id)) {
        group.derived.push(entry);
      }
    });
  });

  return [...groups.values()]
    .map((group) => {
      const rootMatches = entryMatchesSearch(group.root, dictionary, matchOptions);
      const matchedDerived = group.derived.filter((entry) => entryMatchesSearch(entry, dictionary, matchOptions));
      return {
        ...group,
        derived: (query && !rootMatches ? matchedDerived : group.derived).sort(compareEntries),
        matchedDerived,
        rootMatches,
      };
    })
    .filter((group) => !query || group.rootMatches || group.matchedDerived.length)
    .sort((a, b) => compareEntries(a.root, b.root));
}

function ensureRootGroup(groups, entry) {
  if (!groups.has(entry.id)) {
    groups.set(entry.id, { root: entry, derived: [], matchedDerived: [] });
  }
  return groups.get(entry.id);
}

function entryHasSources(entry) {
  return Boolean(entry?.etymology?.sources?.length);
}

function sourceRootEntries(entry, dictionary = activeDictionary(), seen = new Set()) {
  const roots = [];
  (entry.etymology?.sources || []).forEach((sourceName) => {
    const source = resolveSourceEntry(sourceName, dictionary);
    if (!source || seen.has(source.id)) {
      return;
    }
    seen.add(source.id);
    if (!entryHasSources(source)) {
      roots.push(source);
      return;
    }
    const ancestors = sourceRootEntries(source, dictionary, seen);
    if (ancestors.length) {
      roots.push(...ancestors);
    } else {
      roots.push(source);
    }
  });
  return roots;
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
  if (!query) {
    return true;
  }
  if (text.includes(query)) {
    return true;
  }
  return fuzzyEnabled && fuzzyScore(text, query) > 0;
}

function highlightSearchText(value, fuzzyEnabled = Boolean(activeDictionary()?.settings?.fuzzySearch)) {
  const text = String(value || "");
  const query = normalize(searchQuery);
  if (!normalizeDictionarySettings(activeDictionary()?.settings).searchHighlight) {
    return escapeHtml(text);
  }
  if (!text || !query) {
    return escapeHtml(text);
  }

  const normalizedText = normalize(text);
  const index = normalizedText.indexOf(query);
  if (index >= 0) {
    return [
      escapeHtml(text.slice(0, index)),
      `<mark>${escapeHtml(text.slice(index, index + query.length))}</mark>`,
      escapeHtml(text.slice(index + query.length)),
    ].join("");
  }

  if (!fuzzyEnabled || fuzzyScore(text, query) <= 0) {
    return escapeHtml(text);
  }
  return highlightFuzzyText(text, query);
}

function highlightFuzzyText(value, query) {
  const text = String(value || "");
  let queryIndex = 0;
  let html = "";
  for (const char of text) {
    if (queryIndex < query.length && normalize(char) === query[queryIndex]) {
      html += `<mark>${escapeHtml(char)}</mark>`;
      queryIndex += 1;
    } else {
      html += escapeHtml(char);
    }
  }
  return html;
}

function renderEntrySearchSnippets(entry) {
  const query = normalize(searchQuery);
  if (!query) {
    return "";
  }
  const dictionary = activeDictionary();
  const fuzzyEnabled = Boolean(dictionary?.settings?.fuzzySearch);
  const fields = [
    ...entry.definitions.flatMap((definition) => [
      [t("example"), definition.example],
      [t("definitionNote"), definition.note],
    ]),
    [t("entryNotes"), entry.notes],
    [t("etymology"), entry.etymology?.description],
    ...morphologySearchStrings(entry, dictionary).map((value) => [t("morphologyDisplay"), value]),
  ];
  const snippets = fields
    .filter(([, value]) => value && textMatches(normalize(value), query, fuzzyEnabled))
    .slice(0, 2)
    .map(([label, value]) => `
      <span class="search-snippet">
        <b>${escapeHtml(label)}</b>
        ${highlightSearchText(compactSearchSnippet(value), fuzzyEnabled)}
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
  const text = normalize(value);
  const needle = normalize(query);
  if (!needle) {
    return 0;
  }
  if (text.includes(needle)) {
    return 100 + needle.length;
  }

  let score = 0;
  let lastIndex = -1;
  for (const char of needle) {
    const index = text.indexOf(char, lastIndex + 1);
    if (index < 0) {
      return 0;
    }
    score += index === lastIndex + 1 ? 6 : 2;
    lastIndex = index;
  }
  return score - Math.max(0, text.length - needle.length) * 0.02;
}

function renderDetail() {
  const dictionary = activeDictionary();
  const entry = selectedEntry();
  const isEditing = editorMode === "edit";

  elements.entryDisplay.hidden = isEditing || !dictionary || !entry;
  elements.entryForm.hidden = !dictionary || !isEditing;

  if (!dictionary) {
    return;
  }

  if (isEditing) {
    fillEntryForm(entry || entryDraft);
    return;
  }

  if (!entry) {
    elements.entryDisplay.hidden = false;
    renderEmptyDetail();
    return;
  }

  renderEntryDisplay(entry);
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

  renderEtymology(entry);
  renderDerivedEntries(entry);
  renderMorphologyDisplay(entry);
  elements.displayEntryNotesSection.hidden = !entry.notes;
  elements.displayEntryNotes.textContent = entry.notes || "";
}

function renderEtymology(entry) {
  const dictionary = activeDictionary();
  const sources = entry.etymology?.sources || [];
  const description = entry.etymology?.description || "";
  elements.displayEtymologySection.hidden = !sources.length && !description;
  elements.displayEtymology.innerHTML = "";

  if (sources.length) {
    const sourceRow = document.createElement("div");
    sourceRow.className = "source-row";
    sources.forEach((sourceName) => {
      const source = resolveSourceEntry(sourceName, dictionary);
      if (source) {
        const button = document.createElement("button");
        button.className = "source-link";
        button.type = "button";
        button.textContent = source.lemma;
        button.addEventListener("click", () => switchToEntry(source.id));
        sourceRow.append(button);
      } else {
        const pending = document.createElement("span");
        pending.className = "source-link pending-source";
        pending.textContent = sourceName;
        sourceRow.append(pending);
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

function renderDerivedEntries(entry) {
  const dictionary = activeDictionary();
  const derived = findDerivedEntries(entry, dictionary);
  elements.displayDerivedSection.hidden = !derived.length;
  elements.displayDerived.innerHTML = "";

  derived.forEach((derivedEntry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "derived-link";
    const partText = entryPartText(derivedEntry, dictionary);
    button.innerHTML = `
      <strong>${escapeHtml(derivedEntry.lemma)}</strong>
      ${partText ? `<span>${escapeHtml(partText)}</span>` : ""}
    `;
    button.addEventListener("click", () => switchToEntry(derivedEntry.id));
    elements.displayDerived.append(button);
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
  if (networkEntryId) {
    state.selectedEntryId = networkEntryId;
    editorMode = "display";
  }
  networkOpen = false;
  render();
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
  const sources = (entry.etymology?.sources || [])
    .map((source) => resolveSourceEntry(source, dictionary))
    .filter(Boolean);
  const derived = findDerivedEntries(entry, dictionary);

  renderNetworkNodeList(elements.networkSources, sources);
  renderNetworkNodeList(elements.networkDerived, derived);
  elements.networkFocus.innerHTML = "";
  elements.networkFocus.append(createNetworkNode(entry, true));
}

function renderNetworkNodeList(container, entries) {
  container.innerHTML = "";
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
  if (!meanings.length) {
    return "";
  }
  const visibleMeanings = showPolysemy ? meanings : meanings.slice(0, 1);
  const numbered = showPolysemy && visibleMeanings.length > 1;
  return `<div class="network-definition-list">${visibleMeanings.map((meaning, index) => `
    <p>${escapeHtml(numbered ? `${index + 1}. ${meaning}` : meaning)}</p>
  `).join("")}</div>`;
}

function findDerivedEntries(entry, dictionary = activeDictionary()) {
  const currentKeys = new Set([normalize(entry.id), normalize(entry.lemma)].filter(Boolean));
  return (dictionary?.entries || [])
    .filter((candidate) => {
      if (candidate.id === entry.id) {
        return false;
      }
      return (candidate.etymology?.sources || []).some((source) => currentKeys.has(normalize(source)));
    })
    .sort((a, b) => a.lemma.localeCompare(b.lemma, "zh-CN"));
}

function resolveSourceEntry(sourceName, dictionary = activeDictionary()) {
  const normalized = normalize(sourceName);
  return dictionary?.entries.find((entry) => normalize(entry.lemma) === normalized || normalize(entry.id) === normalized) || null;
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
  const gloss = { gla: [], glb: [], glc: [], ft: "" };
  let hasGloss = false;
  String(example || "")
    .replaceAll("\\n", "\n")
    .split(/\r?\n/)
    .forEach((line) => {
      const match = line.match(/^\\(gla|glb|glc|ft)\s*(.*)$/);
      if (!match) {
        return;
      }
      hasGloss = true;
      if (match[1] === "ft") {
        gloss.ft = match[2].trim();
      } else {
        gloss[match[1]] = match[2].trim().split(/\s+/).filter(Boolean);
      }
    });
  return hasGloss ? gloss : null;
}

function renderSmallCaps(value) {
  return String(value || "").replace(/[a-z0-9]+|[&<>"']/g, (match) => {
    if (/^[a-z0-9]+$/.test(match)) {
      return `<span class="smallcaps">${match}</span>`;
    }
    return escapeHtml(match);
  });
}

function renderChips(entry, limit = 4, highlight = false, fuzzyEnabled = Boolean(activeDictionary()?.settings?.tagFuzzySearch), clickable = false) {
  const tags = entry.tags || [];
  const hasHiddenTags = tags.length > limit;
  const visibleLimit = hasHiddenTags ? Math.max(1, limit - 1) : limit;
  const chips = tags
    .slice(0, visibleLimit)
    .map((tag, index) => {
      const text = displayTag(tag);
      const classes = ["chip", entryTagIsPart(entry, index, tag) ? "part-chip" : "", tagIsRedHighlighted(tag) ? "highlight-tag" : ""].filter(Boolean).join(" ");
      const tagAttributes = clickable
        ? ` data-entry-tag-index="${index}" data-entry-tag-value="${escapeHtml(tag)}"`
        : "";
      return `<span class="${classes}"${tagAttributes}>${highlight ? highlightSearchText(text, fuzzyEnabled) : escapeHtml(text)}</span>`;
    })
    .join("");
  const hiddenTagTitle = hasHiddenTags
    ? tags.slice(visibleLimit).map((tag) => displayTag(tag)).join(", ")
    : "";
  const ellipsisChip = hasHiddenTags
    ? `<span class="chip ellipsis-chip" title="${escapeHtml(hiddenTagTitle)}" aria-label="${escapeHtml(hiddenTagTitle)}">...</span>`
    : "";
  return `${chips}${ellipsisChip}`;
}

function morphologyTables(dictionary = activeDictionary()) {
  return normalizeMorphology(dictionary?.morphology).tables;
}

function resolveEntryMorphologyTable(entry, dictionary = activeDictionary()) {
  const tables = morphologyTables(dictionary);
  const selected = entry.morphology?.tableId || "auto";
  if (selected === "none") {
    return null;
  }
  if (selected && selected !== "auto") {
    return tables.find((table) => table.id === selected) || null;
  }
  const entryTags = new Set((entry.tags || []).map(normalize));
  return tables.find((table) => table.matchTags.some((tag) => entryTags.has(normalize(tag)))) || null;
}

function morphologyCellValue(entry, table, row, col, dictionary = activeDictionary()) {
  const key = morphologyCellKey(row, col);
  const override = entry.morphology?.overrides?.[key];
  if (override) {
    return override;
  }
  return morphologyCellDefaultValue(entry, table, row, col, dictionary);
}

function morphologyCellDefaultValue(entry, table, row, col, dictionary = activeDictionary()) {
  const key = morphologyCellKey(row, col);
  const cell = table.cells?.[key] || normalizeMorphologyCell();
  const rule = cell.value.trim();
  if (!rule) {
    return entry.lemma;
  }
  return applyMorphologyRuleSyntax(entry.lemma, rule, morphologyFunctionConfig(dictionary));
}

function morphologyFunctionConfig(dictionary = activeDictionary()) {
  return normalizeMorphology(dictionary?.morphology).functions;
}

function applyMorphologyRuleSyntax(lemma, rule, functions = normalizeMorphologyFunctions()) {
  const text = expandMorphologyReferences(rule, lemma);
  let output = "";
  let index = 0;

  while (index < text.length) {
    if (text[index] === "/") {
      const end = text.indexOf("/", index + 1);
      if (end >= 0) {
        output += evaluateMorphologyConditionBlock(
          text.slice(index + 1, end),
          output,
          morphologyRightContext(text.slice(end + 1), lemma),
          lemma,
          functions
        );
        index = end + 1;
        continue;
      }
    }

    output += text[index];
    index += 1;
  }

  return output;
}

function evaluateMorphologyConditionBlock(block, leftContext, rightContext, lemma, functions = normalizeMorphologyFunctions()) {
  const clauses = String(block || "").split(/;/);
  for (const clause of clauses) {
    const parsed = parseMorphologyConditionClause(clause);
    if (!parsed) {
      continue;
    }
    if (parsed.type === "else" || morphologyConditionMatches(parsed.condition, leftContext, rightContext, functions)) {
      return renderMorphologyConditionOutput(parsed.output, lemma);
    }
  }
  return "";
}

function parseMorphologyConditionClause(clause) {
  const text = String(clause || "").trim();
  if (!text) {
    return null;
  }
  const equalsIndex = text.indexOf("=");
  const left = equalsIndex >= 0 ? text.slice(0, equalsIndex).trim() : text.trim();
  const output = equalsIndex >= 0 ? text.slice(equalsIndex + 1).trim() : "";
  if (left.toLowerCase() === "else") {
    return { type: "else", output };
  }
  return { type: "condition", condition: left, output };
}

function morphologyConditionMatches(condition, leftContext, rightContext, functions = normalizeMorphologyFunctions()) {
  const call = parseMorphologyFunctionCondition(condition);
  if (!call || !call.options.length || call.invalidOffset) {
    return false;
  }
  if (call.name === "left" || call.name === "right") {
    const found = nthDirectionalCharacter(call.name === "left" ? leftContext : rightContext, call.name, call.offset);
    return Boolean(found && call.options.includes(found));
  }

  const recognized = functions[call.name] || [];
  if (!recognized.length) {
    return false;
  }
  const nearest = call.name === "rightV"
    ? nearestRightMatch(rightContext, recognized)
    : nearestLeftMatch(leftContext, recognized);
  return Boolean(nearest && call.options.includes(nearest));
}

function parseMorphologyFunctionCondition(condition) {
  const match = String(condition || "").match(/^(leftV|rightV|left|right)\(([^()]*)\)(?:\(([^()]*)\))?$/i);
  if (!match) {
    return null;
  }
  const name = morphologyFunctionName(match[1]);
  const rawOffset = match[3];
  const offset = rawOffset === undefined ? 1 : Number.parseInt(rawOffset, 10);
  const invalidOffset = rawOffset !== undefined && (!/^[1-9]\d*$/.test(rawOffset.trim()) || !Number.isInteger(offset));
  return {
    name,
    options: splitList(match[2]),
    offset: invalidOffset ? 1 : offset,
    invalidOffset,
  };
}

function morphologyFunctionName(name) {
  const normalized = String(name || "").toLowerCase();
  if (normalized === "rightv") {
    return "rightV";
  }
  if (normalized === "left") {
    return "left";
  }
  if (normalized === "right") {
    return "right";
  }
  return "leftV";
}

function nthDirectionalCharacter(context, direction, offset) {
  const chars = Array.from(String(context || ""));
  if (chars.length < offset) {
    return "";
  }
  return direction === "right" ? chars[offset - 1] : chars[chars.length - offset];
}

function nearestLeftMatch(context, options) {
  const text = String(context || "");
  const candidates = [...options].sort((a, b) => b.length - a.length);
  for (let index = text.length - 1; index >= 0; index -= 1) {
    const found = candidates.find((candidate) => text.startsWith(candidate, index));
    if (found) {
      return found;
    }
  }
  return "";
}

function nearestRightMatch(context, options) {
  const text = String(context || "");
  const candidates = [...options].sort((a, b) => b.length - a.length);
  for (let index = 0; index < text.length; index += 1) {
    const found = candidates.find((candidate) => text.startsWith(candidate, index));
    if (found) {
      return found;
    }
  }
  return "";
}

function morphologyRightContext(fragment, lemma) {
  const text = expandMorphologyReferences(fragment, lemma);
  let context = "";
  let index = 0;

  while (index < text.length) {
    if (text[index] === "/") {
      const end = text.indexOf("/", index + 1);
      if (end >= 0) {
        index = end + 1;
        continue;
      }
    }

    context += text[index];
    index += 1;
  }

  return context;
}

function renderMorphologyConditionOutput(output, lemma) {
  return expandMorphologyReferences(output, lemma);
}

function expandMorphologyReferences(value, lemma) {
  const text = String(value || "");
  let rendered = "";
  let index = 0;

  while (index < text.length) {
    const reference = consumeMorphologyReference(text, index, lemma);
    if (reference) {
      rendered += reference.value;
      index = reference.nextIndex;
      continue;
    }
    rendered += text[index];
    index += 1;
  }

  return rendered;
}

function consumeMorphologyReference(text, index, lemma) {
  if (text[index] !== "{") {
    return null;
  }
  const end = text.indexOf("}", index + 1);
  if (end < 0) {
    return null;
  }
  return {
    value: renderMorphologyReference(text.slice(index + 1, end), lemma),
    nextIndex: end + 1,
  };
}

function renderMorphologyReference(body, lemma) {
  const text = String(body || "").trim();
  if (!text || text.toLowerCase() === "lemma") {
    return lemma;
  }

  const replacements = text
    .split(",")
    .map(parseMorphologyReplacement)
    .filter((replacement) => replacement?.valid);

  if (!replacements.length) {
    return lemma;
  }

  return applyMorphologyReplacements(lemma, replacements);
}

function parseMorphologyReplacement(item) {
  const equalsIndex = String(item || "").indexOf("=");
  if (equalsIndex < 0) {
    return { valid: false, reason: "missing =" };
  }
  const rawTarget = item.slice(0, equalsIndex).trim();
  const to = item.slice(equalsIndex + 1).trim();
  const selectorMatch = rawTarget.match(/^(.*?)(?:\[([^\]]*)\])?$/);
  const from = selectorMatch?.[1]?.trim() || "";
  const rawSelector = selectorMatch?.[2]?.trim();
  if (!from) {
    return { valid: false, reason: "missing target" };
  }
  if (rawSelector === "*") {
    return { valid: true, from, to, selector: "*" };
  }
  if (rawSelector === undefined) {
    return { valid: true, from, to, selector: 1 };
  }
  if (rawSelector === "") {
    return { valid: false, reason: "invalid selector []" };
  }
  if (!/^-?[1-9]\d*$/.test(rawSelector)) {
    return { valid: false, reason: `invalid selector [${rawSelector}]` };
  }
  return { valid: true, from, to, selector: Number.parseInt(rawSelector, 10) };
}

function applyMorphologyReplacements(lemma, replacements) {
  const scheduled = [];
  replacements.forEach((replacement, order) => {
    morphologyReplacementTargets(lemma, replacement).forEach((target) => {
      for (let index = scheduled.length - 1; index >= 0; index -= 1) {
        if (rangesOverlap(scheduled[index], target)) {
          scheduled.splice(index, 1);
        }
      }
      scheduled.push({ ...target, to: replacement.to, order });
    });
  });

  if (!scheduled.length) {
    return lemma;
  }

  scheduled.sort((a, b) => a.start - b.start || a.order - b.order);
  let output = "";
  let cursor = 0;
  scheduled.forEach((item) => {
    if (item.start < cursor) {
      return;
    }
    output += lemma.slice(cursor, item.start);
    output += item.to;
    cursor = item.end;
  });
  return output + lemma.slice(cursor);
}

function morphologyReplacementTargets(lemma, replacement) {
  const matches = morphologyReplacementMatches(lemma, replacement.from);
  if (replacement.selector === "*") {
    return matches;
  }
  const index = replacement.selector > 0
    ? replacement.selector - 1
    : matches.length + replacement.selector;
  return matches[index] ? [matches[index]] : [];
}

function morphologyReplacementMatches(lemma, target) {
  const matches = [];
  let index = 0;
  while (index <= lemma.length - target.length) {
    const found = lemma.indexOf(target, index);
    if (found < 0) {
      break;
    }
    matches.push({ start: found, end: found + target.length });
    index = found + Math.max(1, target.length);
  }
  return matches;
}

function rangesOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

function morphologySearchStrings(entry, dictionary = activeDictionary()) {
  const table = resolveEntryMorphologyTable(entry, dictionary);
  if (!table) {
    return [];
  }
  const values = [];
  for (let row = 0; row < table.rows; row += 1) {
    for (let col = 0; col < table.cols; col += 1) {
      values.push(morphologyCellValue(entry, table, row, col, dictionary));
    }
  }
  return values;
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
  const report = buildDictionaryAnalysis(dictionary);
  elements.analysisPanel.innerHTML = renderAnalysisPage(report);
  setupAnalysisMasonryLayouts();
}

function renderAnalysisPage(report) {
  const analysisViewState = activeAnalysisViewState();
  const page = analysisViewState.page || "overview";
  const subpage = activeAnalysisSubpage(page);
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
    ["quality", aText("质量检查", "Quality")],
  ];
  return `<nav class="analysis-page-tabs">${pages.map(([page, label]) => `
    <button type="button" class="${page === activePage ? "active" : ""}" data-analysis-page="${escapeHtml(page)}">${escapeHtml(label)}</button>
  `).join("")}</nav>`;
}

function analysisSubpageNav(page, activeSubpage, report = null) {
  if (page === "quality") {
    return `<div class="analysis-subpage-tab-groups quality-subpage-tab-groups">${analysisQualitySubpageGroups().map((group) => `
      <div class="analysis-subpage-tab-group">
        <span>${escapeHtml(group.label)}</span>
        <nav class="analysis-subpage-tabs">${group.subpages.map(([subpage, label]) => `
          ${renderAnalysisQualitySubpageButton(subpage, label, activeSubpage, report)}
        `).join("")}</nav>
      </div>
    `).join("")}</div>`;
  }
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
    quality: analysisQualitySubpageGroups().flatMap((group) => group.subpages),
  };
  return subpages[page] || [];
}

function renderAnalysisQualitySubpageButton(subpage, label, activeSubpage, report = null) {
  const count = report ? analysisQualitySubpageEntryCount(report, subpage) : null;
  const isActive = subpage === activeSubpage;
  const disabled = count === 0 && !isActive;
  const countBadge = count === null ? "" : `<span class="analysis-tab-count">${escapeHtml(count)}</span>`;
  return `<button type="button" class="${isActive ? "active" : ""}" data-analysis-subpage="${escapeHtml(subpage)}" ${disabled ? "disabled" : ""}>${escapeHtml(label)}${countBadge}</button>`;
}

function analysisQualitySubpageGroups() {
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
  if (page === "quality") {
    return renderAnalysisQualityPage(report, subpage);
  }
  return renderAnalysisOverview(report);
}

function renderAnalysisOverview(report) {
  const issueEntries = qualityIssuesWithEntries(report.issues);
  const highIssues = issueEntries.filter((issue) => issue.severity === "high");
  const highIssueEntryIds = entryIdsFrom(highIssues.map((issue) => issue.entryId));
  return `
    <section class="analysis-grid analysis-summary-grid">
      ${analysisMetricCard(aText("词条", "Entries"), report.entries.length, `${report.rootCount} ${aText("个词根", "roots")}`, viewAction("editor"))}
      ${analysisMetricCard(aText("衍生词", "Derived"), report.derivedCount, `${report.isolatedRootCount} ${aText("个孤立词根", "isolated roots")}`, advancedFilterAction(aText("衍生词", "Derived entries"), report.derivedEntryIds))}
      ${analysisMetricCard(aText("释义覆盖", "Definition Coverage"), percentText(report.coverage.definitions), `${report.definitionCount} ${aText("条释义", "definitions")}`, advancedFilterAction(aText("有释义", "Has definitions"), report.definitionEntryIds, { variants: [{ title: aText("无释义", "No definitions"), entryIds: report.noDefinitionEntryIds }] }))}
      ${analysisMetricCard("IPA", percentText(report.coverage.ipa), `${report.ipa.syllableAverage} ${aText("平均音节", "avg syllables")}`, advancedFilterAction(aText("有 IPA", "Has IPA"), report.ipaEntryIds, { variants: [{ title: aText("无 IPA", "No IPA"), entryIds: report.noIpaEntryIds }] }))}
      ${analysisMetricCard(aText("形态学", "Morphology"), percentText(report.coverage.morphology), `${report.morphology.generatedForms} ${aText("个生成形式", "generated forms")}`, advancedFilterAction(aText("有形态表格", "Has morphology table"), report.morphologyEntryIds, { variants: [{ title: aText("无形态表格", "No morphology table"), entryIds: report.noMorphologyEntryIds }] }))}
      ${analysisMetricCard(aText("质量问题", "Quality Issues"), report.issues.length, `${highIssueEntryIds.length} ${aText("个高优先级", "high priority")}`, qualityIssueFilterAction(report, "priority", "all"))}
    </section>
    <section class="analysis-grid">
      ${analysisCard(aText("词性分布", "Part of Speech"), analysisBarList(report.parts, { empty: aText("暂无词性标签", "No part-of-speech tags yet") }))}
      ${analysisCard(aText("标签频率", "Tag Frequency"), analysisBarList(report.tags, { empty: aText("暂无标签", "No tags yet") }))}
      ${analysisCard(aText("词根家族排行", "Root Families"), analysisBarList(report.rootFamilies, { empty: aText("暂无衍生关系", "No derivation links yet") }))}
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

function renderAnalysisQualityPage(report, subpage) {
  const filterBar = renderAnalysisQualityFilterBar(report, subpage);
  if (["lemma", "tags", "ipa", "other"].includes(subpage)) {
    const moduleIssues = qualityIssuesByModule(report, subpage);
    return `${filterBar}<section class="analysis-detail-grid">${analysisCard(qualityIssueModuleLabel(subpage), analysisIssueList(moduleIssues, { limit: Infinity }))}</section>`;
  }
  if (subpage === "network") {
    return `${filterBar}<section class="analysis-detail-grid">${analysisCard(aText("词源网络检查", "Etymology Network Checks"), analysisIssueList(report.networkIssues, { limit: Infinity }))}</section>`;
  }
  if (subpage === "gloss") {
    const glossIssues = qualityIssuesByModule(report, "gloss");
    return `${filterBar}<section class="analysis-detail-grid">
      ${analysisCard(aText("Glossed 例句", "Glossed Examples"), analysisFactList([[aText("Glossed 例句", "Glossed examples"), report.glossExamples, advancedFilterAction(aText("Glossed 例句", "Glossed examples"), report.glossEntryIds)]]))}
      ${analysisCard(aText("Glossed 例句问题", "Glossed Example Issues"), analysisIssueList(glossIssues, { limit: Infinity }))}
    </section>`;
  }
  if (["high", "medium", "low"].includes(subpage)) {
    const issues = report.issues.filter((issue) => issue.severity === subpage);
    return `${filterBar}<section class="analysis-detail-grid">${analysisCard(aText("质量检查", "Quality Checks"), analysisIssueList(issues, { limit: Infinity }))}</section>`;
  }
  return `${filterBar}<section class="analysis-detail-grid">${analysisCard(aText("质量检查", "Quality Checks"), analysisIssueList(report.issues, { limit: Infinity }))}</section>`;
}

function renderAnalysisQualityFilterBar(report, subpage) {
  const label = analysisQualitySubpageLabel(subpage);
  const count = analysisQualitySubpageEntryCount(report, subpage);
  const action = analysisQualityFilterActionForSubpage(report, subpage);
  const attrs = analysisActionAttributes(action);
  return `
    <section class="analysis-quality-current" aria-label="${escapeHtml(aText("质量检查高级筛选", "Quality advanced filters"))}">
      <strong>${escapeHtml(t("qualityCurrentCategory"))}: ${escapeHtml(label)}</strong>
      <span>${escapeHtml(count)} ${escapeHtml(t("qualityEntryCount"))}</span>
      <button class="secondary-button analysis-quality-view-button" type="button"${attrs} ${attrs ? "" : "disabled"}>${escapeHtml(t("viewQualityEntries"))}</button>
      <button class="info-button" type="button" data-action="quality-filter-info" aria-label="${escapeHtml(t("qualityFilterInfo"))}" title="${escapeHtml(t("qualityFilterInfo"))}">i</button>
    </section>
  `;
}

function qualityIssuesWithEntries(issues = []) {
  return (issues || []).filter((issue) => issue.entryId);
}

function analysisQualitySubpageKey(subpage) {
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

function analysisQualitySubpageLabel(subpage) {
  const labels = Object.fromEntries(analysisQualitySubpageGroups().flatMap((group) => group.subpages));
  return labels[subpage] || labels.issues || aText("全部问题", "All Issues");
}

function analysisQualitySubpageEntryCount(report, subpage) {
  const action = analysisQualityFilterActionForSubpage(report, subpage);
  return action?.entryIds?.length || 0;
}

function analysisQualityFilterActionForSubpage(report, subpage) {
  const { group, key } = analysisQualitySubpageKey(subpage);
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
  return (report.issues || []).filter((issue) => (issue.module || "other") === module);
}

function qualityIssueEntryIdsByModule(report, module) {
  return entryIdsFrom(qualityIssuesByModule(report, module).map((issue) => issue.entryId));
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

function countPrimaryStressMarks(value) {
  return [...String(value || "")].filter((char) => char === "ˈ" || char === IPA_STRESS_MARKER).length;
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

function buildDictionaryAnalysis(dictionary) {
  const entries = dictionary.entries || [];
  const total = entries.length || 1;
  const rootGroups = rootModeGroups(dictionary, { query: "" });
  const derivedEntries = entries.filter(entryHasSources);
  const derivedIdSet = new Set(derivedEntries.map((entry) => entry.id));
  const isolatedRootCount = rootGroups.filter((group) => !group.derived.length && !derivedIdSet.has(group.root.id)).length;
  const parts = new Map();
  const tags = new Map();
  const tagCombos = new Map();
  const initialLetters = new Map();
  const wordLengths = new Map();
  const characters = new Map();
  const bigrams = new Map();
  const issues = [];
  const networkIssues = [];
  const duplicateLemmas = new Map();
  const normalizedTagForms = new Map();
  const definitionEntryIds = new Set();
  const exampleEntryIds = new Set();
  const glossEntryIds = new Set();
  const noteEntryIds = new Set();
  const sourceEntryIds = new Set();
  const ipaEntryIds = new Set();
  const morphologyEntryIds = new Set();
  const multiSourceEntryIds = new Set();

  let definitionCount = 0;
  let examples = 0;
  let glossExamples = 0;
  let entriesWithDefinition = 0;
  let entriesWithExample = 0;
  let entriesWithNotes = 0;
  let entriesWithSource = 0;
  let entriesWithIpa = 0;
  let entriesWithMorphology = 0;
  let multiSourceCount = 0;

  entries.forEach((entry) => {
    const lemmaKey = normalize(entry.lemma);
    if (lemmaKey) {
      mapPush(duplicateLemmas, lemmaKey, entry);
    }
    const entryPartTags = entryParts(entry, dictionary);
    if (entryPartTags.length) {
      entryPartTags.forEach((part) => incrementEntry(parts, part, entry));
    } else {
      incrementEntry(parts, NO_PART_FILTER_VALUE, entry);
    }
    (entry.tags || []).forEach((tag) => {
      incrementEntry(tags, tag, entry);
      const compact = normalize(tag).replace(/[^\p{L}\p{N}]+/gu, "");
      if (compact) {
        mapPush(normalizedTagForms, compact, tag);
      }
    });
    if ((entry.tags || []).length > 1) {
      incrementEntry(tagCombos, entry.tags.map((tag) => displayTag(tag, dictionary)).join(" + "), entry);
    }

    const lemma = String(entry.lemma || "");
    if (lemma) {
      incrementEntry(wordLengths, String(Array.from(lemma).length), entry);
      incrementEntry(initialLetters, Array.from(lemma.trim())[0] || "", entry);
      Array.from(lemma.replace(/\s+/g, "")).forEach((char) => incrementEntry(characters, char, entry));
      Array.from(lemma.replace(/\s+/g, "")).forEach((char, index, chars) => {
        if (index < chars.length - 1) {
          incrementEntry(bigrams, `${char}${chars[index + 1]}`, entry);
        }
      });
    }

    const definitions = entry.definitions || [];
    const meaningfulDefinitions = definitions.filter((definition) => definition.meaning);
    definitionCount += meaningfulDefinitions.length;
    if (meaningfulDefinitions.length) {
      entriesWithDefinition += 1;
      definitionEntryIds.add(entry.id);
    }
    if (definitions.some((definition) => definition.example)) {
      entriesWithExample += 1;
      exampleEntryIds.add(entry.id);
    }
    examples += definitions.filter((definition) => definition.example).length;
    definitions.forEach((definition) => {
      const gloss = parseGloss(definition.example);
      if (gloss) {
        glossExamples += 1;
        glossEntryIds.add(entry.id);
        const missing = ["gla", "glb", "ft"].filter((key) => key === "ft" ? !gloss.ft : !gloss[key]?.length);
        if (missing.length) {
          addIssue(issues, "medium", entry, aText("Gloss 不完整", "Incomplete gloss"), `${aText("缺少", "Missing")}: ${missing.map((key) => `\\${key}`).join(", ")}`, "gloss");
        } else if (gloss.gla.length !== gloss.glb.length) {
          addIssue(issues, "medium", entry, aText("Gloss 对齐数量不一致", "Gloss alignment mismatch"), `\\gla ${gloss.gla.length} / \\glb ${gloss.glb.length}`, "gloss");
        }
      }
    });

    if (entry.notes) {
      entriesWithNotes += 1;
      noteEntryIds.add(entry.id);
    }
    if (entryHasSources(entry)) {
      entriesWithSource += 1;
      sourceEntryIds.add(entry.id);
    }
    if ((entry.etymology?.sources || []).length > 1) {
      multiSourceCount += 1;
      multiSourceEntryIds.add(entry.id);
    }
    if (entry.pronunciation) {
      entriesWithIpa += 1;
      ipaEntryIds.add(entry.id);
    }
    if (resolveEntryMorphologyTable(entry, dictionary)) {
      entriesWithMorphology += 1;
      morphologyEntryIds.add(entry.id);
    }
  });

  duplicateLemmas.forEach((items) => {
    if (items.length > 1) {
      items.forEach((entry) => addIssue(issues, "high", entry, aText("重复词形", "Duplicate lemma"), items.map((item) => item.lemma).join(", "), "lemma"));
    }
  });
  normalizedTagForms.forEach((forms) => {
    const unique = [...new Set(forms)];
    if (unique.length > 1) {
      issues.push({
        severity: "low",
        title: aText("近似标签可能不一致", "Near-duplicate tags"),
        detail: unique.join(", "),
        module: "tags",
      });
    }
  });

  entries.forEach((entry) => {
    if (!entry.lemma) {
      addIssue(issues, "high", entry, aText("缺少词形", "Missing lemma"), "", "lemma");
    }
    if (!(entry.tags || []).length) {
      addIssue(issues, "high", entry, aText("缺少标签", "Missing tags"), "", "tags");
    }
    if (!(entry.definitions || []).some((definition) => definition.meaning)) {
      addIssue(issues, "high", entry, aText("缺少释义", "Missing definition"), "");
    }
    if (!entry.pronunciation) {
      addIssue(issues, "low", entry, aText("缺少 IPA", "Missing IPA"), "", "ipa");
    } else {
      const primaryStressCount = countPrimaryStressMarks(entry.pronunciation);
      if (primaryStressCount > 1) {
        addIssue(
          issues,
          "medium",
          entry,
          aText("多个主重音", "Multiple primary stresses"),
          `${aText("主重音数量", "Primary stress count")}: ${primaryStressCount}`,
          "ipa",
        );
      }
    }
    (entry.tags || []).filter((tag) => Array.from(tag).length > 24).forEach((tag) => {
      addIssue(issues, "low", entry, aText("标签过长", "Long tag"), tag, "tags");
    });
    (entry.etymology?.sources || []).forEach((sourceName) => {
      if (!resolveSourceEntry(sourceName, dictionary)) {
        addIssue(networkIssues, "medium", entry, aText("未解析来源", "Unresolved source"), sourceName, "network");
        addIssue(issues, "medium", entry, aText("未解析来源", "Unresolved source"), sourceName, "network");
      }
    });
    const cycle = sourceCycleForEntry(entry, dictionary);
    if (cycle.length) {
      const detail = cycle.map((item) => item.lemma).join(" → ");
      addIssue(networkIssues, "high", entry, aText("词源循环引用", "Etymology cycle"), detail, "network");
      addIssue(issues, "high", entry, aText("词源循环引用", "Etymology cycle"), detail, "network");
    }
  });

  const ipa = analyzeIpa(entries, dictionary);
  const morphology = analyzeMorphology(entries, dictionary);
  const coverage = {
    definitions: entriesWithDefinition / total,
    examples: entriesWithExample / total,
    notes: entriesWithNotes / total,
    sources: entriesWithSource / total,
    ipa: entriesWithIpa / total,
    morphology: entriesWithMorphology / total,
  };
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
  const coverageRows = [
    [aText("有释义", "Definitions"), coverage.definitions, binaryCoverageFilterAction(aText("有释义", "Has definitions"), [...definitionEntryIds], aText("无释义", "No definitions"), noDefinitionEntryIds)],
    [aText("有例句", "Examples"), coverage.examples, binaryCoverageFilterAction(aText("有例句", "Has examples"), [...exampleEntryIds], aText("无例句", "No examples"), noExampleEntryIds)],
    [aText("有备注", "Notes"), coverage.notes, binaryCoverageFilterAction(aText("有备注", "Has notes"), [...noteEntryIds], aText("无备注", "No notes"), noNoteEntryIds)],
    [aText("有来源", "Sources"), coverage.sources, binaryCoverageFilterAction(aText("有来源", "Has sources"), [...sourceEntryIds], aText("无来源", "No sources"), noSourceEntryIds)],
    ["IPA", coverage.ipa, binaryCoverageFilterAction(aText("有 IPA", "Has IPA"), [...ipaEntryIds], aText("无 IPA", "No IPA"), noIpaEntryIds)],
    [aText("形态表格", "Morphology table"), coverage.morphology, binaryCoverageFilterAction(aText("有形态表格", "Has morphology table"), [...morphologyEntryIds], aText("无形态表格", "No morphology table"), noMorphologyEntryIds)],
  ];
  const searchMatchEntries = normalize(searchQuery)
    ? entries.filter((entry) => entryMatchesSearch(entry, dictionary))
    : entries;

  return {
    entries,
    rootCount: rootGroups.length,
    derivedCount: derivedEntries.length,
    derivedEntryIds: derivedEntries.map((entry) => entry.id),
    isolatedRootCount,
    definitionCount,
    examples,
    glossExamples,
    multiSourceCount,
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
    multiSourceEntryIds: [...multiSourceEntryIds],
    parts: partEntryMapItems(parts, 12, dictionary),
    allParts: partEntryMapItems(parts, Number.MAX_SAFE_INTEGER, dictionary),
    tags: tagEntryMapItems(tags, 16, dictionary),
    allTags: tagEntryMapItems(tags, Number.MAX_SAFE_INTEGER, dictionary),
    tagCombos: topEntryMapItems(tagCombos, 10, aText("标签组合", "Tag Combination")),
    allTagCombos: topEntryMapItems(tagCombos, Number.MAX_SAFE_INTEGER, aText("标签组合", "Tag Combination")),
    initialLetters: topEntryMapItems(initialLetters, 14, aText("首字母", "Initial Letter")),
    allInitialLetters: topEntryMapItems(initialLetters, Number.MAX_SAFE_INTEGER, aText("首字母", "Initial Letter")),
    wordLengths: numericEntryMapItems(wordLengths, aText("词长", "Word Length")),
    allWordLengths: numericEntryMapItems(wordLengths, aText("词长", "Word Length")),
    characters: topEntryMapItems(characters, 16, aText("正写法字符", "Orthographic Character")),
    allCharacters: topEntryMapItems(characters, Number.MAX_SAFE_INTEGER, aText("正写法字符", "Orthographic Character")),
    bigrams: topEntryMapItems(bigrams, 16, aText("正写法双字符组合", "Orthographic Bigram")),
    allBigrams: topEntryMapItems(bigrams, Number.MAX_SAFE_INTEGER, aText("正写法双字符组合", "Orthographic Bigram")),
    rootFamilies: rootGroups
      .filter((group) => group.derived.length)
      .sort((a, b) => b.derived.length - a.derived.length)
      .slice(0, 12)
      .map((group) => [group.root.lemma, group.derived.length, directEntryAction(group.root.id)]),
    allRootFamilies: rootGroups
      .filter((group) => group.derived.length)
      .sort((a, b) => b.derived.length - a.derived.length)
      .map((group) => [group.root.lemma, group.derived.length, directEntryAction(group.root.id)]),
    ipa,
    morphology,
    coverage,
    coverageRows,
    issues,
    searchMatches: searchMatchEntries.length,
    searchMatchEntryIds: searchMatchEntries.map((entry) => entry.id),
    searchFields: analyzeSearchFields(entries, dictionary),
    networkIssues: networkIssues.length ? networkIssues : [{
      severity: "ok",
      title: aText("未发现词源网络问题", "No etymology network issues found"),
      detail: `${derivedEntries.length} ${aText("个衍生词", "derived entries")} / ${multiSourceCount} ${aText("个多来源词条", "multi-source entries")}`,
    }],
    activity: analyzeActivity(entries),
  };
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
  const query = normalize(searchQuery);
  if (!query) {
    return [];
  }
  const settings = normalizeDictionarySettings(dictionary.settings);
  const counts = new Map();
  entries.forEach((entry) => {
    const parts = entryParts(entry, dictionary);
    const fieldGroups = [
      [aText("词形", "Lemma"), [entry.lemma], settings.fuzzySearch],
      [aText("标签", "Tags"), [...parts, ...parts.map((part) => displayTag(part, dictionary)), ...(entry.tags || []), ...(entry.tags || []).map((tag) => displayTag(tag, dictionary))], settings.tagFuzzySearch],
      [aText("释义", "Definitions"), (entry.definitions || []).map((definition) => definition.meaning), settings.fuzzySearch],
      [aText("例句", "Examples"), (entry.definitions || []).map((definition) => definition.example), settings.fuzzySearch],
      [aText("词源", "Etymology"), [...(entry.etymology?.sources || []), entry.etymology?.description], settings.fuzzySearch],
      ["IPA", [entry.pronunciation], settings.fuzzySearch],
      [aText("形态形式", "Morphology forms"), morphologySearchStrings(entry, dictionary), settings.fuzzySearch],
      [aText("备注", "Notes"), [entry.notes, ...(entry.definitions || []).map((definition) => definition.note)], settings.fuzzySearch],
    ];
    fieldGroups.forEach(([label, values, fuzzy]) => {
      const text = values.map(normalize).join(" ");
      if (textMatches(text, query, Boolean(fuzzy))) {
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

function addIssue(list, severity, entry, title, detail = "", module = "other") {
  list.push({
    severity,
    entryId: entry?.id || "",
    entryLemma: entry?.lemma || "",
    title,
    detail,
    module,
  });
}

function sourceCycleForEntry(entry, dictionary) {
  const path = [];
  const seen = new Set();
  const visit = (current) => {
    if (!current) {
      return [];
    }
    if (seen.has(current.id)) {
      const index = path.findIndex((item) => item.id === current.id);
      return index >= 0 ? [...path.slice(index), current] : [current];
    }
    seen.add(current.id);
    path.push(current);
    for (const sourceName of current.etymology?.sources || []) {
      const source = resolveSourceEntry(sourceName, dictionary);
      const cycle = visit(source);
      if (cycle.length) {
        return cycle;
      }
    }
    path.pop();
    seen.delete(current.id);
    return [];
  };
  return visit(entry);
}

function cleanIpaText(value) {
  return String(value || "")
    .replace(/[\/\[\]]/g, "")
    .replace(/[ˈˌ]/g, "")
    .trim();
}

function normalizeIpaCompare(value) {
  return cleanIpaText(value).replace(/\s+/g, "");
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
  const normalizedTag = normalize(tag);
  return Boolean(normalizedTag)
    && (dictionary?.entries || []).some((entry) => entryParts(entry, dictionary).some((part) => normalize(part) === normalizedTag));
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

function renderMorphologyDisplay(entry) {
  const table = resolveEntryMorphologyTable(entry);
  elements.displayMorphologySection.hidden = !table;
  elements.displayMorphology.innerHTML = "";
  if (!table) {
    return;
  }
  const wrapper = document.createElement("div");
  wrapper.className = "morphology-table-scroll";
  const rows = [];
  rows.push(`<tr><th>${escapeHtml(table.name)}</th>${table.colLabels.map((label) => `<th>${escapeHtml(label)}</th>`).join("")}</tr>`);
  for (let row = 0; row < table.rows; row += 1) {
    rows.push(`<tr><th>${escapeHtml(table.rowLabels[row])}</th>${Array.from({ length: table.cols }, (_, col) => `<td>${escapeHtml(morphologyCellValue(entry, table, row, col, activeDictionary()))}</td>`).join("")}</tr>`);
  }
  wrapper.innerHTML = `<table class="morphology-table">${rows.join("")}</table>`;
  elements.displayMorphology.append(wrapper);
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
        <small>${escapeHtml(dictionaryStatsText(dictionary))}${isActive ? ` · ${t("current")}` : ""}</small>
      </div>
      <p>${escapeHtml(dictionary.description || t("noDescription"))}</p>
      <div class="card-actions">
        <button class="secondary-button" type="button" data-action="config">${escapeHtml(t("config"))}</button>
        ${isActive ? "" : `<button class="secondary-button" type="button" data-action="activate">${escapeHtml(t("setCurrent"))}</button>`}
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
    definitions: [normalizeDefinition()],
    etymology: { sources: [], description: "" },
    morphology: { tableId: "auto", overrides: {} },
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
  renderDefinitionFormList(formEntry.definitions || [normalizeDefinition()]);
  renderEntryMorphologyControls(formEntry);
  renderIpaKeyboard(activeDictionary());
}

function renderEntryMorphologyControls(entry) {
  const tables = morphologyTables();
  const current = entry.morphology?.tableId || "auto";
  elements.entryMorphologyTableSelect.innerHTML = [
    `<option value="auto">${escapeHtml(t("morphologyAuto"))}</option>`,
    `<option value="none">${escapeHtml(t("morphologyNone"))}</option>`,
    ...tables.map((table) => `<option value="${escapeHtml(table.id)}">${escapeHtml(table.name)}</option>`),
  ].join("");
  elements.entryMorphologyTableSelect.value = ["auto", "none", ...tables.map((table) => table.id)].includes(current) ? current : "auto";
  renderEntryMorphologyOverrides(entry);
}

function selectedEntryMorphologyTableForForm(entry = selectedEntry()) {
  const dictionary = activeDictionary();
  const tableId = elements.entryMorphologyTableSelect.value;
  if (tableId === "none") {
    return null;
  }
  if (tableId === "auto") {
    const previewEntry = {
      ...(entry || {}),
      lemma: elements.lemmaInput.value.trim(),
      tags: splitList(elements.tagsInput.value),
      morphology: { tableId: "auto", overrides: {} },
    };
    return resolveEntryMorphologyTable(previewEntry, dictionary);
  }
  return morphologyTables(dictionary).find((table) => table.id === tableId) || null;
}

function renderEntryMorphologyOverrides(entry = selectedEntry(), keepValues = false) {
  const previous = keepValues ? collectEntryMorphologyOverrides() : normalizeMorphologyOverrides(entry?.morphology?.overrides);
  const table = selectedEntryMorphologyTableForForm(entry);
  elements.entryMorphologyOverrides.innerHTML = "";
  if (!table) {
    return;
  }
  const previewEntry = {
    ...(entry || {}),
    lemma: elements.lemmaInput.value.trim() || entry?.lemma || "",
    tags: splitList(elements.tagsInput.value),
    morphology: { tableId: elements.entryMorphologyTableSelect.value, overrides: {} },
  };
  const help = document.createElement("p");
  help.className = "field-help";
  help.textContent = t("morphologyOverrideHelp");
  elements.entryMorphologyOverrides.append(help);
  const grid = document.createElement("div");
  grid.className = "morphology-override-list";
  for (let row = 0; row < table.rows; row += 1) {
    for (let col = 0; col < table.cols; col += 1) {
      const key = morphologyCellKey(row, col);
      const label = `${table.rowLabels[row]} / ${table.colLabels[col]}`;
      const defaultValue = morphologyCellDefaultValue(previewEntry, table, row, col);
      grid.insertAdjacentHTML("beforeend", `
        <label>
          <span>${escapeHtml(label)}</span>
          <input class="morphology-override-input" data-morphology-override="${escapeHtml(key)}" value="${escapeHtml(previous[key] || "")}" placeholder="${escapeHtml(defaultValue)}">
        </label>
      `);
    }
  }
  elements.entryMorphologyOverrides.append(grid);
}

function collectEntryMorphologyOverrides() {
  return normalizeMorphologyOverrides(Object.fromEntries(
    [...elements.entryMorphologyOverrides.querySelectorAll("[data-morphology-override]")]
      .map((input) => [input.dataset.morphologyOverride, input.value]),
  ));
}

function renderPartialMorphologyControls(entry) {
  const body = partialEditBody();
  const select = body?.querySelector('[data-field="morphologyTable"]');
  const host = body?.querySelector(".partial-morphology-overrides");
  if (!select || !host) {
    return;
  }
  const tables = morphologyTables();
  const current = entry.morphology?.tableId || "auto";
  select.innerHTML = [
    `<option value="auto">${escapeHtml(t("morphologyAuto"))}</option>`,
    `<option value="none">${escapeHtml(t("morphologyNone"))}</option>`,
    ...tables.map((table) => `<option value="${escapeHtml(table.id)}">${escapeHtml(table.name)}</option>`),
  ].join("");
  select.value = ["auto", "none", ...tables.map((table) => table.id)].includes(current) ? current : "auto";
  select.addEventListener("change", () => renderPartialMorphologyOverrides({}, select.value));
  renderPartialMorphologyOverrides(entry.morphology?.overrides, select.value);
}

function partialMorphologyTable(tableId) {
  if (tableId === "none") {
    return null;
  }
  if (tableId === "auto") {
    return resolveEntryMorphologyTable({
      ...(selectedEntry() || {}),
      morphology: { tableId: "auto", overrides: {} },
    });
  }
  return morphologyTables().find((table) => table.id === tableId) || null;
}

function renderPartialMorphologyOverrides(overrides = {}, tableId = partialEditBody()?.querySelector('[data-field="morphologyTable"]')?.value || "auto") {
  const body = partialEditBody();
  const host = body?.querySelector(".partial-morphology-overrides");
  if (!host) {
    return;
  }
  const table = partialMorphologyTable(tableId);
  host.innerHTML = "";
  if (!table) {
    return;
  }
  host.insertAdjacentHTML("beforeend", `<p class="field-help">${escapeHtml(t("morphologyOverrideHelp"))}</p>`);
  const grid = document.createElement("div");
  grid.className = "morphology-override-list";
  const normalizedOverrides = normalizeMorphologyOverrides(overrides);
  const previewEntry = selectedEntry() || {};
  for (let row = 0; row < table.rows; row += 1) {
    for (let col = 0; col < table.cols; col += 1) {
      const key = morphologyCellKey(row, col);
      const defaultValue = morphologyCellDefaultValue(previewEntry, table, row, col);
      grid.insertAdjacentHTML("beforeend", `
        <label>
          <span>${escapeHtml(table.rowLabels[row])} / ${escapeHtml(table.colLabels[col])}</span>
          <input class="morphology-override-input" data-morphology-override="${escapeHtml(key)}" value="${escapeHtml(normalizedOverrides[key] || "")}" placeholder="${escapeHtml(defaultValue)}">
        </label>
      `);
    }
  }
  host.append(grid);
}

function collectPartialMorphologyOverrides() {
  return normalizeMorphologyOverrides(Object.fromEntries(
    [...(partialEditBody()?.querySelectorAll("[data-morphology-override]") || [])]
      .map((input) => [input.dataset.morphologyOverride, input.value]),
  ));
}

function renderDefinitionFormList(definitions) {
  elements.definitionFormList.innerHTML = "";
  definitions.forEach((definition, index) => {
    const block = document.createElement("article");
    block.className = "definition-form-card";
    block.dataset.definitionId = definition.id || uid("def");
    block.innerHTML = `
      <div class="definition-form-header">
        <strong>${escapeHtml(t("definitions"))} ${index + 1}</strong>
        <button class="danger-ghost" type="button" data-action="remove-definition">${escapeHtml(t("removeDefinition"))}</button>
      </div>
      <label>
        <span>${escapeHtml(t("meaning"))}</span>
        <textarea data-field="meaning" rows="3">${escapeHtml(definition.meaning)}</textarea>
      </label>
      <label>
        <span>${escapeHtml(t("example"))}</span>
        <textarea data-field="example" rows="2">${escapeHtml(definition.example)}</textarea>
      </label>
      <label>
        <span>${escapeHtml(t("definitionNote"))}</span>
        <textarea data-field="note" rows="2">${escapeHtml(definition.note)}</textarea>
      </label>
    `;
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

function collectDefinitions() {
  return [...elements.definitionFormList.querySelectorAll(".definition-form-card")]
    .map((card) => ({
      id: card.dataset.definitionId || uid("def"),
      meaning: card.querySelector('[data-field="meaning"]').value.trim(),
      example: card.querySelector('[data-field="example"]').value.trim(),
      note: card.querySelector('[data-field="note"]').value.trim(),
    }))
    .filter((definition) => definition.meaning || definition.example || definition.note);
}

function completeSourceAtCursor() {
  const dictionary = activeDictionary();
  if (!dictionary) {
    return false;
  }

  const input = elements.sourceEntryInput;
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
  const normalizedPrefix = normalize(prefix);
  if (!dictionary || !normalizedPrefix) {
    return [];
  }
  const fuzzyEnabled = Boolean(dictionary.settings?.sourceFuzzyCompletion);
  return dictionary.entries
    .map((entry) => {
      const lemma = normalize(entry.lemma);
      let score = 0;
      if (lemma.startsWith(normalizedPrefix)) {
        score = 1000 - Math.abs(lemma.length - normalizedPrefix.length);
      } else if (fuzzyEnabled && lemma.includes(normalizedPrefix)) {
        score = 700 - lemma.indexOf(normalizedPrefix);
      } else if (fuzzyEnabled) {
        score = fuzzyScore(lemma, normalizedPrefix);
      }
      return { entry, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.lemma.localeCompare(b.entry.lemma, "zh-CN"))
    .slice(0, 6)
    .map((item) => item.entry);
}

function renderSourceAutocomplete() {
  const input = elements.sourceEntryInput;
  const segment = sourceSegmentAtCursor(input.value, input.selectionStart ?? input.value.length);
  const candidates = sourceCompletionCandidates(segment.prefix);
  if (sourceSuggestionIndex >= candidates.length) {
    sourceSuggestionIndex = 0;
  }
  elements.sourceSuggestionBox.innerHTML = "";
  elements.sourceSuggestionBox.hidden = !candidates.length || document.activeElement !== input;

  candidates.forEach((entry, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = index === sourceSuggestionIndex ? "selected" : "";
    button.textContent = entry.lemma;
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      fillSourceSegment(entry.lemma);
    });
    elements.sourceSuggestionBox.append(button);
  });
}

function selectedSourceCandidate() {
  const input = elements.sourceEntryInput;
  const segment = sourceSegmentAtCursor(input.value, input.selectionStart ?? input.value.length);
  const candidates = sourceCompletionCandidates(segment.prefix);
  return candidates[sourceSuggestionIndex] || candidates[0] || null;
}

function fillSourceSegment(value) {
  const input = elements.sourceEntryInput;
  const segment = sourceSegmentAtCursor(input.value, input.selectionStart ?? input.value.length);
  const replacement = `${segment.leading}${value}${segment.trailing}`;
  input.value = `${input.value.slice(0, segment.start)}${replacement}${input.value.slice(segment.end)}`;
  const nextCursor = segment.start + segment.leading.length + value.length;
  input.focus();
  input.setSelectionRange(nextCursor, nextCursor);
  renderSourceAutocomplete();
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
  elements.activateDictionaryButton.hidden = !isExisting || dictionary.id === state.activeDictionaryId;
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
  elements.manualPartOfSpeechTagsInput.checked = settings.manualPartOfSpeechTags;
  elements.partOfSpeechTagsInput.value = settings.partOfSpeechTags.join(", ");
  syncPartOfSpeechTagSettingsControls();
  elements.tagSortOrderInput.value = settings.tagSortOrder.join(", ");
  elements.tagRedHighlightInput.value = settings.redHighlightTags.join("\n");
  elements.entryListTagFilteringInput.checked = settings.entryListTagFiltering;
  elements.entryListPolysemyInput.checked = settings.entryListPolysemyDisplay;
  elements.networkPolysemyInput.checked = settings.networkPolysemyDisplay;
  elements.fuzzySearchInput.checked = settings.fuzzySearch;
  elements.tagFuzzySearchInput.checked = settings.tagFuzzySearch;
  elements.sourceFuzzyInput.checked = settings.sourceFuzzyCompletion;
  elements.searchHighlightInput.checked = settings.searchHighlight;
  elements.savePartialOnSwitchInput.value = settings.partialEditPageSwitchAction;
  elements.saveFullOnSwitchInput.value = settings.fullEditPageSwitchAction;
  elements.corpusAutoSaveInput.checked = settings.corpusAutoSave;
  elements.docsAutoSaveInput.checked = settings.docsAutoSave;
  elements.allowEmptyPronunciationInput.checked = settings.allowEmptyPronunciation;
  elements.allowEmptyTagsInput.checked = settings.allowEmptyTags;
  elements.allowEmptyDefinitionsInput.checked = settings.allowEmptyDefinitions;
  elements.ipaKeyboardInput.value = normalizeIpaKeyboard(settings.ipaKeyboard).join(" ");
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

function collectToolNavOrder() {
  return normalizeToolNavOrder([...elements.toolNavOrderList?.querySelectorAll(".tool-order-card") || []]
    .map((card) => card.dataset.view));
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

function renderIpaKeyboard(dictionary = activeDictionary()) {
  const symbols = normalizeIpaKeyboard(dictionary?.settings?.ipaKeyboard);
  elements.ipaKeyboard.innerHTML = "";
  symbols.forEach((symbol) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ipa-key";
    button.textContent = symbol;
    button.title = symbol;
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
    button.title = symbol;
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
  card.dataset.ruleId = rule.id || uid("ipa");
  card.innerHTML = `
    <div class="ipa-rule-grid">
      <button class="ipa-rule-drag-handle" type="button" draggable="true" aria-label="${escapeHtml(t("reorderIpaRule"))}" title="${escapeHtml(t("reorderIpaRule"))}">⋮⋮</button>
      <textarea class="ipa-single-line" rows="1" data-field="from" aria-label="${escapeHtml(t("ruleFrom"))}" placeholder="${escapeHtml(t("ruleFrom"))}">${escapeHtml(rule.from)}</textarea>
      <textarea class="ipa-single-line" rows="1" data-field="to" aria-label="${escapeHtml(t("ruleTo"))}" placeholder="${escapeHtml(t("ruleTo"))}">${escapeHtml(rule.to)}</textarea>
      <textarea class="ipa-single-line" rows="1" data-field="before" aria-label="${escapeHtml(t("ruleBefore"))}" placeholder="${escapeHtml(t("ruleBefore"))}">${escapeHtml(rule.before)}</textarea>
      <textarea class="ipa-single-line" rows="1" data-field="after" aria-label="${escapeHtml(t("ruleAfter"))}" placeholder="${escapeHtml(t("ruleAfter"))}">${escapeHtml(rule.after)}</textarea>
      <button class="icon-danger-button" type="button" data-action="remove-ipa-rule" aria-label="${escapeHtml(t("removeRule"))}" title="${escapeHtml(t("removeRule"))}">🗑</button>
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
  draggedIpaRuleId = "";
  renderIpaSandbox();
}

function collectIpaRuleList(container) {
  return [...container.querySelectorAll(".ipa-rule-card")]
    .map((card) => normalizeIpaRule({
      id: card.dataset.ruleId || uid("ipa"),
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
    manualPartOfSpeechTags: elements.manualPartOfSpeechTagsInput.checked,
    partOfSpeechTags: normalizeTagList(elements.partOfSpeechTagsInput.value),
    tagSortOrder: normalizeTagList(elements.tagSortOrderInput.value),
    redHighlightTags: normalizeRedHighlightTags(elements.tagRedHighlightInput.value),
    entryListTagFiltering: elements.entryListTagFilteringInput.checked,
    entryListPolysemyDisplay: elements.entryListPolysemyInput.checked,
    networkPolysemyDisplay: elements.networkPolysemyInput.checked,
    fuzzySearch: elements.fuzzySearchInput.checked,
    tagFuzzySearch: elements.tagFuzzySearchInput.checked,
    sourceFuzzyCompletion: elements.sourceFuzzyInput.checked,
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
    manualPartOfSpeechTags: settings.manualPartOfSpeechTags,
    partOfSpeechTags: settings.partOfSpeechTags,
    tagSortOrder: settings.tagSortOrder,
    redHighlightTags: settings.redHighlightTags,
    entryListTagFiltering: settings.entryListTagFiltering,
    entryListPolysemyDisplay: settings.entryListPolysemyDisplay,
    networkPolysemyDisplay: settings.networkPolysemyDisplay,
    fuzzySearch: settings.fuzzySearch,
    tagFuzzySearch: settings.tagFuzzySearch,
    sourceFuzzyCompletion: settings.sourceFuzzyCompletion,
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

function morphologyFormSnapshot() {
  return normalizeMorphology({ functions: collectMorphologyFunctions(), tables: collectMorphologyTables() });
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

function morphologyFormIsDirty() {
  return stableJson(morphologyFormSnapshot()) !== stableJson(savedMorphologySnapshot());
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
  const {
    glossSmallCaps,
    glossFontFamily,
    glossFont,
    glossStyles,
    corpusGlossAlign,
    savePartialEditOnSwitch,
    saveFullEditOnSwitch,
    savePartialEditOnPageSwitch,
    saveFullEditOnPageSwitch,
    partialEditPageSwitchAction,
    fullEditPageSwitchAction,
    ...existingSettings
  } = existing || {};

  return {
    ...existingSettings,
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
    manualPartOfSpeechTags: elements.manualPartOfSpeechTagsInput.checked,
    partOfSpeechTags: normalizeTagList(elements.partOfSpeechTagsInput.value),
    tagSortOrder: normalizeTagList(elements.tagSortOrderInput.value),
    redHighlightTags: normalizeRedHighlightTags(elements.tagRedHighlightInput.value),
    entryListTagFiltering: elements.entryListTagFilteringInput.checked,
    entryListPolysemyDisplay: elements.entryListPolysemyInput.checked,
    networkPolysemyDisplay: elements.networkPolysemyInput.checked,
    fuzzySearch: elements.fuzzySearchInput.checked,
    tagFuzzySearch: elements.tagFuzzySearchInput.checked,
    sourceFuzzyCompletion: elements.sourceFuzzyInput.checked,
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

async function saveSettings(event) {
  event.preventDefault();
  const dictionary = activeDictionary();
  if (!dictionary) {
    showToast(t("createDictionaryFirstToast"));
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

  dictionary.settings = collectDictionarySettingsFromForm(dictionary.settings);
  if (!dictionary.settings.docsAutoSave) {
    clearTimeout(docsSaveTimer);
  }
  if (!dictionary.settings.corpusAutoSave) {
    clearTimeout(corpusSaveTimer);
  }
  dictionary.updatedAt = new Date().toISOString();
  await persistDictionary(dictionary);
  showToast(t("dictionarySaved"));
  return true;
}

async function applyTagSortOrder() {
  const dictionary = activeDictionary();
  if (!dictionary) {
    showToast(t("createDictionaryFirstToast"));
    return;
  }

  const order = normalizeTagList(elements.tagSortOrderInput.value);
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

  const confirmed = await appConfirm(t("tagOrderConfirm"), {
    title: t("tagOrderSettings"),
  });
  if (!confirmed) {
    return;
  }

  const now = new Date().toISOString();
  let changedEntries = 0;
  dictionary.settings = collectDictionarySettingsFromForm(dictionary.settings);
  dictionary.entries = (dictionary.entries || []).map((entry) => {
    const sortedTags = arrangeTagsByOrder(entry.tags || [], order);
    if (stableJson(sortedTags) === stableJson(entry.tags || [])) {
      return entry;
    }
    changedEntries += 1;
    return {
      ...entry,
      tags: sortedTags,
      updatedAt: now,
    };
  });
  dictionary.updatedAt = now;
  await persistDictionary(dictionary);
  showToast(`${t("tagOrderApplied")}${changedEntries ? ` · ${changedEntries} ${t("entries")}` : ""}`);
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
  const draft = ensureDocsDraft(dictionary);
  const docs = {
    ...(dictionary.docs || {}),
    markdown: draft.markdown,
  };
  await persistDictionaryPatch(dictionary.id, { docs, updatedAt: new Date().toISOString() });
  docsDraftState = null;
  renderLanguageDocs(activeDictionary());
  if (showSavedToast) {
    showToast(t("docsSaved"));
  }
  return true;
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
    renderItem: (unit) => createCorpusUnitCard(unit, corpus, viewState),
  });
}

function corpusVirtualResetToken(viewState) {
  return [state.activeDictionaryId, viewState.mode, normalize(viewState.query)].join("|");
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
      <button class="corpus-icon-button danger" type="button" data-action="remove-corpus-attribute" title="${escapeHtml(t("removeAttribute"))}" aria-label="${escapeHtml(t("removeAttribute"))}">×</button>
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
          <button class="corpus-icon-button" type="button" data-action="move-corpus-layer-up" title="${escapeHtml(t("moveUp"))}" aria-label="${escapeHtml(t("moveUp"))}" ${index === 0 ? "disabled" : ""}>↑</button>
          <button class="corpus-icon-button" type="button" data-action="move-corpus-layer-down" title="${escapeHtml(t("moveDown"))}" aria-label="${escapeHtml(t("moveDown"))}" ${index === block.layers.length - 1 ? "disabled" : ""}>↓</button>
          <button class="corpus-icon-button danger" type="button" data-action="delete-corpus-layer" title="${escapeHtml(t("deleteCorpusLayer"))}" aria-label="${escapeHtml(t("deleteCorpusLayer"))}">×</button>
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
          <button class="corpus-icon-button" type="button" data-action="move-corpus-unit-up" title="${escapeHtml(t("moveUp"))}" aria-label="${escapeHtml(t("moveUp"))}" ${index === 0 ? "disabled" : ""}>↑</button>
          <button class="corpus-icon-button" type="button" data-action="move-corpus-unit-down" title="${escapeHtml(t("moveDown"))}" aria-label="${escapeHtml(t("moveDown"))}" ${index === unitIds.length - 1 ? "disabled" : ""}>↓</button>
          <button class="corpus-icon-button danger" type="button" data-action="unlink-corpus-unit" title="${escapeHtml(t("unlink"))}" aria-label="${escapeHtml(t("unlink"))}">×</button>
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
    const saved = await persistDictionaryPatch(dictionary.id, {
      corpus: snapshot,
      updatedAt: new Date().toISOString(),
    }, { refresh: false });
    savedAny = true;
    clearTimeout(corpusSaveTimer);
    corpusSaveTimer = null;

    // Input may have changed the live draft while this snapshot was being saved.
    if (
      corpusDraftState?.dictionaryId === saved.id
      && stableJson(corpusDraftState.corpus) !== stableJson(saved.corpus)
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
  const corpus = ensureCorpusDraft(dictionary);
  if (!validateDictionaryEntityIds({ ...dictionary, corpus })) {
    return Promise.resolve(false);
  }
  clearTimeout(corpusSaveTimer);
  corpusSaveTimer = null;
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

function renderMorphologyConfig(dictionary) {
  if (!elements.morphologyTableList) {
    return;
  }
  const morphology = normalizeMorphology(dictionary?.morphology);
  const tables = morphology.tables;
  elements.morphologyTableList.innerHTML = "";
  elements.morphologyLeftVObjectsInput.value = morphology.functions.leftV.join("，");
  elements.morphologyRightVObjectsInput.value = morphology.functions.rightV.join("，");
  if (!dictionary) {
    return;
  }
  tables.forEach((table) => elements.morphologyTableList.append(createMorphologyTableEditor(table)));
}

function createMorphologyTableEditor(table) {
  const card = document.createElement("article");
  card.className = "morphology-config-card";
  card.dataset.tableId = table.id;
  const expanded = expandedMorphologyTables.has(table.id);
  const matchTags = table.matchTags.length ? table.matchTags.join(", ") : t("none");
  card.classList.toggle("is-collapsed", !expanded);
  card.innerHTML = `
    <div class="morphology-card-header">
      <div>
        <p class="eyebrow">${escapeHtml(t("morphologyTable"))}</p>
        <div class="morphology-card-title-row">
          <input data-field="name" value="${escapeHtml(table.name)}" aria-label="${escapeHtml(t("tableName"))}">
          <span class="morphology-card-summary">${table.rows} × ${table.cols} · ${escapeHtml(matchTags)}</span>
        </div>
      </div>
      <div class="panel-actions">
        <button class="secondary-button" type="button" data-action="toggle-morphology-table" aria-expanded="${expanded}">${escapeHtml(expanded ? t("collapse") : t("expand"))}</button>
        <button class="danger-ghost" type="button" data-action="remove-morphology-table">${escapeHtml(t("removeTable"))}</button>
      </div>
    </div>
    <div class="morphology-card-body" ${expanded ? "" : "hidden"}>
      <div class="form-grid">
        <label><span>${escapeHtml(t("rowCount"))}</span><input data-field="rows" type="number" min="1" value="${table.rows}"></label>
        <label><span>${escapeHtml(t("columnCount"))}</span><input data-field="cols" type="number" min="1" value="${table.cols}"></label>
        <label><span>${escapeHtml(t("autoMatchTags"))}</span><input data-field="matchTags" value="${escapeHtml(table.matchTags.join("，"))}"></label>
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
        ${table.colLabels.map((label, col) => `
          <th><input data-col-label="${col}" value="${escapeHtml(label)}" aria-label="${escapeHtml(t("columnLabels"))} ${col + 1}"></th>
        `).join("")}
      </tr>
    </thead>
  `;
  const rows = [];
  for (let row = 0; row < table.rows; row += 1) {
    const cells = [];
    for (let col = 0; col < table.cols; col += 1) {
      const key = morphologyCellKey(row, col);
      const cell = table.cells[key] || normalizeMorphologyCell();
      cells.push(`
        <td class="morphology-rule-cell" data-cell="${escapeHtml(key)}">
          <textarea data-field="value" rows="2" placeholder="{}">${escapeHtml(cell.value)}</textarea>
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

function collectMorphologyTables() {
  return [...elements.morphologyTableList.querySelectorAll(".morphology-config-card")].map((card) => {
    const rows = Math.max(1, Number.parseInt(card.querySelector('[data-field="rows"]').value, 10) || 1);
    const cols = Math.max(1, Number.parseInt(card.querySelector('[data-field="cols"]').value, 10) || 1);
    const rowLabels = Array.from({ length: rows }, (_, index) => card.querySelector(`[data-row-label="${index}"]`)?.value.trim() || `${index + 1}`);
    const colLabels = Array.from({ length: cols }, (_, index) => card.querySelector(`[data-col-label="${index}"]`)?.value.trim() || `${index + 1}`);
    const cells = {};
    card.querySelectorAll(".morphology-rule-cell").forEach((cellNode) => {
      cells[cellNode.dataset.cell] = normalizeMorphologyCell({
        mode: "reference",
        value: cellNode.querySelector('[data-field="value"]').value,
      });
    });
    return normalizeMorphologyTable({
      id: card.dataset.tableId,
      name: card.querySelector('[data-field="name"]').value.trim(),
      rows,
      cols,
      rowLabels,
      colLabels,
      matchTags: splitList(card.querySelector('[data-field="matchTags"]').value),
      cells,
    });
  });
}

function collectMorphologyFunctions() {
  return normalizeMorphologyFunctions({
    leftV: elements.morphologyLeftVObjectsInput.value,
    rightV: elements.morphologyRightVObjectsInput.value,
  });
}

function validateMorphologyFunctionUsage(morphology) {
  const normalized = normalizeMorphology(morphology);
  const errors = [];
  normalized.tables.forEach((table) => {
    Object.values(table.cells).forEach((cell) => {
      extractMorphologyFunctionCalls(cell.value).forEach((call) => {
        if (call.invalidOffset) {
          errors.push(`${table.name}: ${call.name} offset must be a positive integer`);
          return;
        }
        if (call.name === "left" || call.name === "right") {
          return;
        }
        const configured = normalized.functions[call.name] || [];
        if (!configured.length) {
          errors.push(`${table.name}: ${call.name} not configured`);
          return;
        }
        const invalid = call.options.filter((option) => !configured.includes(option));
        if (invalid.length) {
          errors.push(`${table.name}: ${call.name}(${invalid.join(", ")})`);
        }
      });
    });
  });
  return errors;
}

function validateMorphologyReferenceSyntax(morphology) {
  const normalized = normalizeMorphology(morphology);
  const errors = [];
  normalized.tables.forEach((table) => {
    Object.entries(table.cells).forEach(([key, cell]) => {
      const label = morphologyCellErrorLabel(table, key);
      extractMorphologyReferences(cell.value).forEach((reference) => {
        if (reference.unterminated) {
          errors.push(`${label}: missing }`);
          return;
        }
        const body = reference.body.trim();
        if (!body || body.toLowerCase() === "lemma") {
          return;
        }
        body.split(",").forEach((part) => {
          const parsed = parseMorphologyReplacement(part);
          if (!parsed.valid) {
            errors.push(`${label}: {${body}} - ${parsed.reason}`);
          }
        });
      });
    });
  });
  return errors;
}

function extractMorphologyReferences(value) {
  const references = [];
  const text = String(value || "");
  let index = 0;
  while (index < text.length) {
    if (text[index] !== "{") {
      index += 1;
      continue;
    }
    const end = text.indexOf("}", index + 1);
    if (end < 0) {
      references.push({ body: text.slice(index + 1), unterminated: true });
      break;
    }
    references.push({ body: text.slice(index + 1, end), unterminated: false });
    index = end + 1;
  }
  return references;
}

function morphologyCellErrorLabel(table, key) {
  const match = String(key || "").match(/^r(\d+)c(\d+)$/);
  if (!match) {
    return table.name;
  }
  const row = Number.parseInt(match[1], 10);
  const col = Number.parseInt(match[2], 10);
  const rowLabel = table.rowLabels[row] || `${row + 1}`;
  const colLabel = table.colLabels[col] || `${col + 1}`;
  return `${table.name}: ${rowLabel} / ${colLabel}`;
}

function extractMorphologyFunctionCalls(rule) {
  const calls = [];
  const text = String(rule || "");
  let index = 0;
  while (index < text.length) {
    if (text[index] !== "/") {
      index += 1;
      continue;
    }
    const end = text.indexOf("/", index + 1);
    if (end < 0) {
      break;
    }
    String(text.slice(index + 1, end) || "")
      .split(/;/)
      .map(parseMorphologyConditionClause)
      .filter((clause) => clause?.type === "condition")
      .forEach((clause) => {
        const call = parseMorphologyFunctionCondition(clause.condition);
        if (call) {
          calls.push(call);
        }
      });
    index = end + 1;
  }
  return calls;
}

async function saveMorphologyConfig(event) {
  event.preventDefault();
  const dictionary = activeDictionary();
  if (!dictionary) {
    showToast(t("createDictionaryFirstToast"));
    return false;
  }
  const morphology = normalizeMorphology({ functions: collectMorphologyFunctions(), tables: collectMorphologyTables() });
  const syntaxErrors = validateMorphologyReferenceSyntax(morphology);
  if (syntaxErrors.length) {
    await appConfirm(syntaxErrors.join("\n"), {
      title: t("invalidMorphologySyntax"),
      alert: true,
    });
    return false;
  }
  const functionErrors = validateMorphologyFunctionUsage(morphology);
  if (functionErrors.length) {
    await appConfirm(functionErrors.join("\n"), {
      title: t("invalidMorphologyFunctionObjects"),
      alert: true,
    });
    return false;
  }
  dictionary.morphology = morphology;
  dictionary.updatedAt = new Date().toISOString();
  await persistDictionary(dictionary);
  showToast(t("dictionarySaved"));
  return true;
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

async function saveIpaSettings(event) {
  event.preventDefault();
  const dictionary = activeDictionary();
  if (!dictionary) {
    showToast(t("createDictionaryFirstToast"));
    return false;
  }

  const defaultStress = parseIpaDefaultStressInput();
  if (!Number.isInteger(defaultStress)) {
    showToast(t("ipaDefaultStressInvalid"));
    return false;
  }

  dictionary.settings = {
    ...(dictionary.settings || {}),
    ipa: normalizeIpaSettings({
      mappings: collectIpaRuleList(elements.ipaMappingList),
      syllable: {
        vowels: elements.ipaVowelsInput.value.trim() || "aeiouAEIOU",
        separator: elements.ipaSyllableSeparatorInput.value.trim() || ".",
        onsetClusters: normalizeClusterList(elements.ipaOnsetClustersInput.value),
        codaClusters: normalizeClusterList(elements.ipaCodaClustersInput.value),
        complexPhonemes: normalizeClusterList(elements.ipaComplexPhonemesInput.value),
      },
      defaultStress,
      unstressMonosyllables: elements.ipaUnstressMonosyllablesInput.checked,
    }),
  };
  dictionary.updatedAt = new Date().toISOString();
  await persistDictionary(dictionary);
  showToast(t("ipaSaved"));
  return true;
}

function generateIpaFromLemma(lemma, ipaSettings = activeDictionary()?.settings?.ipa) {
  const ipa = normalizeIpaSettings(ipaSettings);
  const source = String(lemma || "").trim();
  if (!source) {
    return "";
  }

  const mapped = applyIpaMappings(source, ipa);
  const syllabified = syllabifyIpaOutput(mapped.output, ipa.syllable);
  const syllables = syllabified.syllables;
  const stressIndex = resolveIpaStressIndex(syllables, syllabified.stressIndex, ipa);
  const separator = ipa.syllable.separator || ".";
  const body = syllables
    .map((syllable, index) => (index === stressIndex ? `ˈ${syllable}` : syllable))
    .join(separator);
  return `/${body}/`;
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
  const input = String(source || "").trim();
  if (!input) {
    return { mapped: "", syllables: "", final: "" };
  }

  const mapped = applyIpaMappings(input, ipa).output;
  const syllabified = syllabifyIpaOutput(mapped, ipa.syllable);
  const syllables = syllabified.syllables;
  const stressIndex = resolveIpaStressIndex(syllables, syllabified.stressIndex, ipa);
  const separator = ipa.syllable.separator || ".";
  const syllableText = syllables.join(separator);
  const finalBody = syllables
    .map((syllable, index) => (index === stressIndex ? `ˈ${syllable}` : syllable))
    .join(separator);
  return {
    mapped: displayIpaStage(mapped),
    syllables: syllableText,
    final: `/${finalBody}/`,
  };
}

function displayIpaStage(value) {
  return String(value || "").replaceAll(IPA_STRESS_MARKER, "ˈ");
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
  const rules = ipa.mappings.filter((rule) => rule.from);

  const chunks = [];
  let index = 0;

  while (index < source.length) {
    const rule = rules.find((candidate) => ruleMatchesAt(source, index, candidate));
    if (!rule) {
      chunks.push(source[index]);
      index += 1;
      continue;
    }

    const rawOutput = rule.to || rule.from;
    let markedOutput = rawOutput.startsWith("'")
      ? `${IPA_STRESS_MARKER}${rawOutput.slice(1)}`
      : rawOutput.replaceAll("ˈ", IPA_STRESS_MARKER);
    chunks.push(markedOutput);
    index += rule.from.length;
  }

  return { output: chunks.join("") };
}

function ruleMatchesAt(source, index, rule) {
  if (!source.startsWith(rule.from, index)) {
    return false;
  }
  const before = source.slice(0, index);
  const after = source.slice(index + rule.from.length);
  return conditionMatches(before, rule.before, true) && conditionMatches(after, rule.after, false);
}

function conditionMatches(value, condition, matchEnd) {
  if (!condition) {
    return true;
  }
  try {
    const pattern = matchEnd ? `${condition}$` : `^${condition}`;
    return new RegExp(pattern).test(value);
  } catch {
    return matchEnd ? value.endsWith(condition) : value.startsWith(condition);
  }
}

function splitIntoSyllables(value, syllableSettings = {}) {
  const separator = syllableSettings.separator || ".";
  const text = String(value || "").replaceAll("ˈ", "");
  if (!text) {
    return [""];
  }
  if (separator && text.includes(separator)) {
    return text.split(separator).filter(Boolean);
  }

  const vowels = new Set(Array.from(String(syllableSettings.vowels || "aeiouAEIOU")));
  const tokens = tokenizePhonemeUnits(text, syllableSettings.complexPhonemes);
  const vowelTokenIndexes = tokens.reduce((positions, token, index) => {
    if (vowels.has(token.value)) {
      positions.push(index);
    }
    return positions;
  }, []);
  if (vowelTokenIndexes.length <= 1) {
    return [text];
  }

  const syllables = [];
  let start = 0;
  vowelTokenIndexes.forEach((tokenIndex, index) => {
    if (index === vowelTokenIndexes.length - 1) {
      return;
    }
    const currentVowel = tokens[tokenIndex];
    const nextVowel = tokens[vowelTokenIndexes[index + 1]];
    const between = text.slice(currentVowel.end, nextVowel.start);
    const codaCluster = matchingCodaCluster(between, syllableSettings);
    const onsetCluster = matchingOnsetCluster(between, syllableSettings);
    const breakAt = codaCluster
      ? currentVowel.end + codaCluster.length
      : onsetCluster
        ? nextVowel.start - onsetCluster.length
        : middleTokenBreak(currentVowel.end, between, syllableSettings.complexPhonemes);
    syllables.push(text.slice(start, breakAt));
    start = breakAt;
  });
  syllables.push(text.slice(start));
  return syllables.filter(Boolean);
}

function tokenizePhonemeUnits(value, complexPhonemes = []) {
  const phonemes = normalizeClusterList(complexPhonemes);
  const text = String(value || "");
  const tokens = [];
  let index = 0;

  while (index < text.length) {
    const phoneme = phonemes.find((candidate) => text.startsWith(candidate, index));
    if (phoneme) {
      tokens.push({ value: phoneme, start: index, end: index + phoneme.length });
      index += phoneme.length;
      continue;
    }

    const char = Array.from(text.slice(index))[0];
    tokens.push({ value: char, start: index, end: index + char.length });
    index += char.length;
  }

  return tokens;
}

function tokenBoundaryPrefixes(tokens) {
  const prefixes = [];
  let value = "";
  tokens.forEach((token) => {
    value += token.value;
    prefixes.push(value);
  });
  return prefixes;
}

function tokenBoundarySuffixes(tokens) {
  const suffixes = [];
  let value = "";
  [...tokens].reverse().forEach((token) => {
    value = `${token.value}${value}`;
    suffixes.push(value);
  });
  return suffixes;
}

function matchingCodaCluster(between, syllableSettings = {}) {
  const tokens = tokenizePhonemeUnits(between, syllableSettings.complexPhonemes);
  const prefixes = tokenBoundaryPrefixes(tokens);
  return normalizeClusterList(syllableSettings.codaClusters).find((cluster) => prefixes.includes(cluster)) || "";
}

function matchingOnsetCluster(between, syllableSettings = {}) {
  const tokens = tokenizePhonemeUnits(between, syllableSettings.complexPhonemes);
  const suffixes = tokenBoundarySuffixes(tokens);
  return normalizeClusterList(syllableSettings.onsetClusters).find((cluster) => suffixes.includes(cluster)) || "";
}

function middleTokenBreak(start, between, complexPhonemes = []) {
  const tokens = tokenizePhonemeUnits(between, complexPhonemes);
  const codaTokenCount = Math.floor(tokens.length / 2);
  const codaLength = tokens
    .slice(0, codaTokenCount)
    .reduce((length, token) => length + token.value.length, 0);
  return start + codaLength;
}

function syllabifyIpaOutput(value, syllableSettings = {}) {
  const text = String(value || "");
  let markerIndex = null;
  let cleanIndex = 0;
  let cleanText = "";

  for (const char of text) {
    if (char === IPA_STRESS_MARKER) {
      if (markerIndex === null) {
        markerIndex = cleanIndex;
      }
      continue;
    }
    cleanText += char;
    cleanIndex += 1;
  }

  const syllables = splitIntoSyllables(cleanText, syllableSettings);
  if (markerIndex === null) {
    return { syllables, stressIndex: null };
  }

  let offset = 0;
  const stressIndex = syllables.findIndex((syllable) => {
    const nextOffset = offset + syllable.length;
    const contains = markerIndex < nextOffset;
    offset = nextOffset;
    return contains;
  });
  return {
    syllables,
    stressIndex: stressIndex >= 0 ? stressIndex : Math.max(0, syllables.length - 1),
  };
}

function defaultStressIndex(length, defaultStress) {
  if (length <= 0) {
    return null;
  }
  if (defaultStress === 0) {
    return null;
  }
  if (defaultStress > 0) {
    return Math.min(defaultStress - 1, length - 1);
  }
  return Math.max(length + defaultStress, 0);
}

function resolveIpaStressIndex(syllables, explicitStressIndex, ipa = normalizeIpaSettings()) {
  const length = syllables.length;
  if (length <= 0 || (ipa.unstressMonosyllables && length === 1)) {
    return null;
  }
  return explicitStressIndex ?? defaultStressIndex(length, ipa.defaultStress);
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
  const dictionary = activeDictionary();
  if (!dictionary) {
    showToast(t("createDictionaryFirstToast"));
    return;
  }
  const defaultStress = parseIpaDefaultStressInput();
  if (!Number.isInteger(defaultStress)) {
    showToast(t("ipaDefaultStressInvalid"));
    return;
  }
  const ipaSettings = ipaSettingsFromForm();
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
  const now = new Date().toISOString();
  targets.forEach((entry) => {
    entry.pronunciation = generateIpaFromLemma(entry.lemma, ipaSettings);
    entry.updatedAt = now;
  });
  dictionary.updatedAt = now;
  await persistDictionary(dictionary);
  await refreshState();
  showToast(`${t("batchIpaUpdated")} ${targets.length}`);
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
      <button class="primary-button" type="submit">${escapeHtml(t("saveConfig"))}</button>
    </div>
  `;
  host.append(form);
  const body = partialEditBody();

  if (section === "basic") {
    body.innerHTML = `
      <label>
        <span>${escapeHtml(t("lemma"))}</span>
        <input data-field="lemma" required maxlength="80" value="${escapeHtml(entry.lemma)}">
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
    renderPartialDefinitionList(entry.definitions || [normalizeDefinition()]);
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "secondary-button";
    addButton.dataset.action = "add-partial-definition";
    addButton.textContent = t("addDefinition");
    body.append(addButton);
  } else if (section === "etymology") {
    body.innerHTML = `
      <label>
        <span>${escapeHtml(t("sourceEntry"))}</span>
        <input data-field="sources" maxlength="220" value="${escapeHtml((entry.etymology?.sources || []).join("，"))}">
      </label>
      <label>
        <span>${escapeHtml(t("etymologyDescription"))}</span>
        <textarea data-field="description" rows="4">${escapeHtml(entry.etymology?.description || "")}</textarea>
      </label>
    `;
  } else if (section === "notes") {
    body.innerHTML = `
      <label>
        <span>${escapeHtml(t("entryNotes"))}</span>
        <textarea data-field="notes" rows="6">${escapeHtml(entry.notes || "")}</textarea>
      </label>
    `;
  } else if (section === "morphology") {
    body.innerHTML = `
      <label>
        <span>${escapeHtml(t("morphologyTable"))}</span>
        <select data-field="morphologyTable"></select>
      </label>
      <div class="partial-morphology-overrides"></div>
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

function renderPartialDefinitionList(definitions) {
  const list = partialEditBody()?.querySelector('[data-partial-definitions="true"]');
  if (!list) {
    return;
  }
  list.innerHTML = "";
  definitions.forEach((definition, index) => {
    const card = document.createElement("article");
    card.className = "definition-form-card";
    card.dataset.definitionId = definition.id || uid("def");
    card.innerHTML = `
      <div class="definition-form-header">
        <strong>${escapeHtml(t("definitions"))} ${index + 1}</strong>
        <button class="danger-ghost" type="button" data-action="remove-partial-definition">${escapeHtml(t("removeDefinition"))}</button>
      </div>
      <label>
        <span>${escapeHtml(t("meaning"))}</span>
        <textarea data-field="meaning" rows="3">${escapeHtml(definition.meaning)}</textarea>
      </label>
      <label>
        <span>${escapeHtml(t("example"))}</span>
        <textarea data-field="example" rows="2">${escapeHtml(definition.example)}</textarea>
      </label>
      <label>
        <span>${escapeHtml(t("definitionNote"))}</span>
        <textarea data-field="note" rows="2">${escapeHtml(definition.note)}</textarea>
      </label>
    `;
    list.append(card);
  });

  const cards = list.querySelectorAll(".definition-form-card");
  cards.forEach((card) => {
    card.querySelector('[data-action="remove-partial-definition"]').hidden = cards.length <= 1;
  });
}

function entrySaveRequirementMessage(entry, dictionary = activeDictionary()) {
  return entryBasicRequirementMessage(entry, dictionary) || entryDefinitionsRequirementMessage(entry, dictionary);
}

function entryBasicRequirementMessage(entry, dictionary = activeDictionary()) {
  const settings = normalizeDictionarySettings(dictionary?.settings);
  if (!entry.lemma?.trim()) {
    return t("requiredEntry");
  }
  if (!settings.allowEmptyPronunciation && !entry.pronunciation?.trim()) {
    return t("requiredPronunciation");
  }
  if (!settings.allowEmptyTags && !(entry.tags || []).length) {
    return t("requiredTags");
  }
  return "";
}

function entryDefinitionsRequirementMessage(entry, dictionary = activeDictionary()) {
  const settings = normalizeDictionarySettings(dictionary?.settings);
  if (!settings.allowEmptyDefinitions && !(entry.definitions || []).some((definition) => definition.meaning)) {
    return t("requiredDefinition");
  }
  return "";
}

function collectPartialDefinitions() {
  return [...(partialEditBody()?.querySelectorAll(".definition-form-card") || [])]
    .map((card) => ({
      id: card.dataset.definitionId || uid("def"),
      meaning: card.querySelector('[data-field="meaning"]').value.trim(),
      example: card.querySelector('[data-field="example"]').value.trim(),
      note: card.querySelector('[data-field="note"]').value.trim(),
    }))
    .filter((definition) => definition.meaning || definition.example || definition.note);
}

async function savePartialEdit(event) {
  event.preventDefault();
  const dictionary = activeDictionary();
  const entry = selectedEntry();
  const body = partialEditBody();
  if (!dictionary || !entry || !body) {
    return false;
  }

  const now = new Date().toISOString();

  if (partialEditSection === "basic") {
    const lemma = body.querySelector('[data-field="lemma"]').value.trim();
    const tags = splitList(body.querySelector('[data-field="tags"]').value);
    const nextEntry = {
      ...entry,
      lemma,
      pronunciation: body.querySelector('[data-field="pronunciation"]').value.trim(),
      tags,
    };
    const message = entryBasicRequirementMessage(nextEntry, dictionary);
    if (message) {
      showToast(message);
      return false;
    }
    entry.lemma = nextEntry.lemma;
    entry.pronunciation = nextEntry.pronunciation;
    entry.tags = nextEntry.tags;
  } else if (partialEditSection === "definitions") {
    const definitions = collectPartialDefinitions();
    const message = entryDefinitionsRequirementMessage({ ...entry, definitions }, dictionary);
    if (message) {
      showToast(message);
      return false;
    }
    entry.definitions = definitions;
  } else if (partialEditSection === "etymology") {
    entry.etymology = {
      sources: splitSourceText(body.querySelector('[data-field="sources"]').value),
      description: body.querySelector('[data-field="description"]').value.trim(),
    };
  } else if (partialEditSection === "notes") {
    entry.notes = body.querySelector('[data-field="notes"]').value.trim();
  } else if (partialEditSection === "morphology") {
    entry.morphology = {
      tableId: body.querySelector('[data-field="morphologyTable"]').value || "auto",
      overrides: collectPartialMorphologyOverrides(),
    };
  }

  entry.updatedAt = now;
  dictionary.updatedAt = now;
  await persistDictionary(dictionary);
  cancelPartialEdit();
  showToast(t("savedEntry"));
  return true;
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
    definitions: [normalizeDefinition()],
    etymology: { sources: [], description: "" },
    morphology: { tableId: "auto", overrides: {} },
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
  if (!validateDictionaryEntityIds(dictionary)) {
    return false;
  }

  const now = new Date().toISOString();
  const entryId = elements.entryId.value || uniqueDictionaryEntityId("entry", dictionary);
  const existing = dictionary.entries.find((entry) => entry.id === entryId);
  const definitions = collectDefinitions();
  const entry = {
    id: entryId,
    lemma: elements.lemmaInput.value.trim(),
    pronunciation: elements.pronunciationInput.value.trim(),
    tags: splitList(elements.tagsInput.value),
    definitions,
    etymology: {
      sources: splitSourceText(elements.sourceEntryInput.value),
      description: elements.etymologyDescriptionInput.value.trim(),
    },
    morphology: {
      tableId: elements.entryMorphologyTableSelect.value || "auto",
      overrides: collectEntryMorphologyOverrides(),
    },
    notes: elements.notesInput.value.trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  const requirementMessage = entrySaveRequirementMessage(entry, dictionary);
  if (requirementMessage) {
    showToast(requirementMessage);
    return false;
  }

  if (existing) {
    Object.assign(existing, entry);
  } else {
    dictionary.entries.push(entry);
  }

  dictionary.updatedAt = now;
  state.selectedEntryId = entry.id;
  entryDraft = null;
  editorMode = "display";
  await persistDictionary(dictionary);
  showToast(t("savedEntry"));
  return true;
}

async function deleteSelectedEntry() {
  const dictionary = activeDictionary();
  const entry = selectedEntry();
  if (!dictionary || !entry) {
    return;
  }

  const confirmed = await appConfirm(`${t("deleteConfirmEntry")} “${entry.lemma}”?`, { danger: true });
  if (!confirmed) {
    return;
  }

  dictionary.entries = dictionary.entries.filter((item) => item.id !== entry.id);
  dictionary.updatedAt = new Date().toISOString();
  state.selectedEntryId = firstLemmaEntry(dictionary)?.id || "";
  editorMode = "display";
  await persistDictionary(dictionary);
  showToast(t("deletedEntry"));
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

  try {
    if (dictionaryId) {
      const existing = selectedDictionaryConfig();
      const updated = {
        ...existing,
        ...payload,
        updatedAt: new Date().toISOString(),
      };
      await api(`/api/dictionaries/${encodeURIComponent(dictionaryId)}`, {
        method: "PUT",
        body: JSON.stringify(updated),
      });
      state.selectedDictionaryConfigId = dictionaryId;
      showToast(t("dictionarySaved"));
    } else {
      const created = await api("/api/dictionaries", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      state.selectedDictionaryConfigId = created.id;
      state.activeDictionaryId = created.id;
      state.selectedEntryId = "";
      editorMode = "display";
      showToast(t("dictionaryCreated"));
    }

    await refreshState();
    return true;
  } catch (error) {
    showToast(t("dictionarySaveFailed"));
    console.error(error);
    return false;
  }
}

async function persistDictionary(dictionary) {
  try {
    const saved = await api(`/api/dictionaries/${encodeURIComponent(dictionary.id)}`, {
      method: "PUT",
      body: JSON.stringify(dictionary),
    });
    await refreshState();
    return saved;
  } catch (error) {
    showToast(t("saveFailed"));
    console.error(error);
    throw error;
  }
}

async function persistDictionaryPatch(dictionaryId, patch, { refresh = true } = {}) {
  try {
    const saved = await api(`/api/dictionaries/${encodeURIComponent(dictionaryId)}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    });
    if (refresh) {
      await refreshState();
      return saved;
    }
    const normalized = normalizeDictionary(saved);
    const dictionaryIndex = state.dictionaries.findIndex((dictionary) => dictionary.id === dictionaryId);
    if (dictionaryIndex >= 0) {
      state.dictionaries[dictionaryIndex] = normalized;
    }
    return normalized;
  } catch (error) {
    showToast(t("saveFailed"));
    console.error(error);
    throw error;
  }
}

async function activateDictionary(dictionaryId) {
  const dictionary = state.dictionaries.find((item) => item.id === dictionaryId);
  if (!dictionary) {
    return;
  }

  try {
    await api(`/api/dictionaries/${encodeURIComponent(dictionaryId)}/activate`, { method: "POST" });
    state.activeDictionaryId = dictionary.id;
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
    showToast(t("dictionarySwitchFailed"));
    console.error(error);
  }
}

async function deleteSelectedDictionary() {
  const dictionary = selectedDictionaryConfig();
  if (!dictionary) {
    return;
  }

  const confirmed = await appConfirm(`${t("deleteConfirmDictionary")} “${dictionary.name}” ${t("andItsEntries")} ${dictionary.entries.length} ${t("entries")}?`, { danger: true });
  if (!confirmed) {
    return;
  }

  try {
    await api(`/api/dictionaries/${encodeURIComponent(dictionary.id)}`, { method: "DELETE" });
    forgetAnalysisViewState(dictionary.id);
    corpusViewStates.delete(dictionary.id);
    if (corpusDraftState?.dictionaryId === dictionary.id) {
      corpusDraftState = null;
    }
    if (docsDraftState?.dictionaryId === dictionary.id) {
      docsDraftState = null;
    }
    state.selectedDictionaryConfigId = "";
    state.selectedEntryId = "";
    editorMode = "display";
    await refreshState();
    showToast(t("dictionaryDeleted"));
  } catch (error) {
    showToast(t("dictionaryDeleteFailed"));
    console.error(error);
  }
}

function exportData() {
  const dictionary = activeDictionary();
  if (!dictionary) {
    showToast(t("createDictionaryFirstToast"));
    return;
  }
  window.location.href = `/api/export?dictionaryId=${encodeURIComponent(dictionary.id)}`;
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
      const existing = state.dictionaries.find((item) => item.id === dictionary.id);
      let overwrite = false;
      if (existing) {
        overwrite = await appConfirm(formatText("importOverwriteMessage", {
          id: dictionary.id,
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
      await api(`/api/import${overwrite ? "?overwrite=true" : ""}`, {
        method: "POST",
        body: JSON.stringify(imported),
      });
      if (overwrite) {
        corpusViewStates.delete(dictionary.id);
        forgetAnalysisViewState(dictionary.id);
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
      showToast(t("importFailed"));
      console.error(error);
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
  state = normalizeState({
    ...serverState,
    selectedEntryId: state.selectedEntryId,
    selectedDictionaryConfigId: state.selectedDictionaryConfigId || serverState.activeDictionaryId,
    activeView: state.activeView,
  });
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
  if (state.activeView === "morphology" && morphologyFormIsDirty()) {
    return confirmUnsavedChanges(t("unsavedMorphologyConfirm"), {
      save: () => saveMorphologyConfig({ preventDefault() {} }),
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
  fetch(`/api/dictionaries/${encodeURIComponent(dictionary.id)}`, {
    method: "PUT",
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
  renderEntries();
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
  if (advancedFilter || normalize(searchQuery)) {
    return;
  }
  rootModeGroups().forEach((group) => expandedRootEntries.add(group.root.id));
  renderEntries();
});

elements.collapseAllRootsButton.addEventListener("click", () => {
  if (advancedFilter || normalize(searchQuery)) {
    return;
  }
  expandedRootEntries.clear();
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
  const button = event.target.closest('[data-action="remove-definition"]');
  if (!button) {
    return;
  }
  button.closest(".definition-form-card").remove();
  updateRemoveDefinitionButtons();
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

elements.entryDisplay.addEventListener("click", (event) => {
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

  const addButton = event.target.closest('[data-action="add-partial-definition"]');
  if (addButton) {
    const definitions = collectPartialDefinitions();
    definitions.push(normalizeDefinition());
    renderPartialDefinitionList(definitions);
    return;
  }

  const removeButton = event.target.closest('[data-action="remove-partial-definition"]');
  if (!removeButton) {
    return;
  }
  removeButton.closest(".definition-form-card").remove();
  renderPartialDefinitionList(collectPartialDefinitions());
});

elements.entryDisplay.addEventListener("submit", (event) => {
  if (!event.target.closest(".inline-partial-edit-form")) {
    return;
  }
  savePartialEdit(event);
});

elements.sourceEntryInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    const segment = sourceSegmentAtCursor(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length);
    const candidates = sourceCompletionCandidates(segment.prefix);
    if (!candidates.length) {
      return;
    }
    event.preventDefault();
    sourceSuggestionIndex =
      event.key === "ArrowDown"
        ? (sourceSuggestionIndex + 1) % candidates.length
        : (sourceSuggestionIndex - 1 + candidates.length) % candidates.length;
    renderSourceAutocomplete();
    return;
  }

  if (event.key !== "Tab" && event.key !== "Enter") {
    return;
  }

  const segment = sourceSegmentAtCursor(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length);
  if (!segment.prefix) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  const candidate = selectedSourceCandidate();
  if (candidate) {
    fillSourceSegment(candidate.lemma);
  }
});
elements.sourceEntryInput.addEventListener("input", () => {
  sourceSuggestionIndex = 0;
  renderSourceAutocomplete();
});
elements.sourceEntryInput.addEventListener("click", () => {
  sourceSuggestionIndex = 0;
  renderSourceAutocomplete();
});
elements.sourceEntryInput.addEventListener("focus", renderSourceAutocomplete);
elements.sourceEntryInput.addEventListener("blur", () => {
  setTimeout(() => {
    elements.sourceSuggestionBox.hidden = true;
  }, 120);
});

elements.addDefinitionButton.addEventListener("click", () => {
  const definitions = collectDefinitions();
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

elements.appTooltipTargets.forEach((button) => {
  button.addEventListener("pointerenter", () => showAppTooltip(button));
  button.addEventListener("pointerleave", () => {
    if (document.activeElement !== button) {
      hideAppTooltip();
    }
  });
  button.addEventListener("focus", () => showAppTooltip(button));
  button.addEventListener("blur", () => {
    if (!button.matches(":hover")) {
      hideAppTooltip();
    }
  });
});
elements.toolList.addEventListener("scroll", hideAppTooltip);
elements.dictionaryManagerButton.addEventListener("click", () => showView("manager"));
elements.navCollapseButton.addEventListener("click", () => {
  if (!wideNavMediaQuery.matches) {
    return;
  }
  shellState.wideNavCollapsed = !shellState.wideNavCollapsed;
  renderShellNav();
});
elements.entryBrowserToggleButton.addEventListener("click", toggleEntryBrowser);
elements.backToEditorButton.addEventListener("click", () => showView("editor"));
elements.backToEditorFromSettingsButton.addEventListener("click", () => showView("editor"));
elements.backToEditorFromAnalysisButton.addEventListener("click", () => showView("editor"));
elements.backToEditorFromDocsButton.addEventListener("click", () => showView("editor"));
elements.backToEditorFromCorpusButton.addEventListener("click", () => showView("editor"));
elements.backToEditorFromMorphologyButton.addEventListener("click", () => showView("editor"));
elements.backToEditorFromIpaButton.addEventListener("click", () => showView("editor"));
elements.addDictionaryButton.addEventListener("click", prepareNewDictionary);
elements.emptyCreateDictionaryButton.addEventListener("click", () => showView("manager"));
elements.settingsOpenDictionaryManagerButton.addEventListener("click", () => showView("manager"));
elements.analysisOpenDictionaryManagerButton.addEventListener("click", () => showView("manager"));
elements.docsOpenDictionaryManagerButton.addEventListener("click", () => showView("manager"));
elements.corpusOpenDictionaryManagerButton.addEventListener("click", () => showView("manager"));
elements.morphologyOpenDictionaryManagerButton.addEventListener("click", () => showView("manager"));
elements.ipaOpenDictionaryManagerButton.addEventListener("click", () => showView("manager"));
elements.newEntryButton.addEventListener("click", () => beginNewEntry());
elements.editEntryButton.addEventListener("click", beginEditEntry);
elements.analysisPanel.addEventListener("click", (event) => {
  const qualityInfoButton = event.target.closest('[data-action="quality-filter-info"]');
  if (qualityInfoButton) {
    appConfirm(t("qualityFilterInfoBody"), {
      title: t("qualityFilterInfo"),
      alert: true,
    });
    return;
  }
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
elements.entryMorphologyTableSelect.addEventListener("change", () => renderEntryMorphologyOverrides(null, false));
elements.tagsInput.addEventListener("input", () => {
  if (elements.entryMorphologyTableSelect.value === "auto") {
    renderEntryMorphologyOverrides(null, true);
  }
});
elements.settingsForm.addEventListener("submit", saveSettings);
elements.manualPartOfSpeechTagsInput.addEventListener("change", syncPartOfSpeechTagSettingsControls);
elements.tagOrderInfoButton.addEventListener("click", () => {
  appConfirm(t("tagOrderInfoBody"), {
    title: t("tagOrderSettings"),
    alert: true,
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
window.addEventListener("scroll", rememberProcessScroll, { passive: true });
elements.docsMarkdownInput.addEventListener("scroll", rememberDocsPaneScroll, { passive: true });
elements.docsPreview.addEventListener("scroll", rememberDocsPaneScroll, { passive: true });
elements.saveDocsButton.addEventListener("click", () => saveLanguageDocs(true));
elements.morphologyForm.addEventListener("submit", saveMorphologyConfig);
elements.morphologySyntaxButton.addEventListener("click", () => {
  elements.morphologySyntaxDialog.hidden = false;
});
elements.closeMorphologySyntaxButton.addEventListener("click", () => {
  elements.morphologySyntaxDialog.hidden = true;
});
elements.morphologySyntaxDialog.addEventListener("click", (event) => {
  if (event.target === elements.morphologySyntaxDialog) {
    elements.morphologySyntaxDialog.hidden = true;
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
elements.addMorphologyTableButton.addEventListener("click", () => {
  const tables = collectMorphologyTables();
  tables.push(normalizeMorphologyTable({ name: `${t("morphologyTable")} ${tables.length + 1}` }));
  renderMorphologyConfig({ morphology: { tables } });
});
elements.morphologyTableList.addEventListener("click", (event) => {
  const toggleButton = event.target.closest('[data-action="toggle-morphology-table"]');
  if (toggleButton) {
    const card = toggleButton.closest(".morphology-config-card");
    const body = card.querySelector(".morphology-card-body");
    const expanded = body.hidden;
    body.hidden = !expanded;
    card.classList.toggle("is-collapsed", !expanded);
    toggleButton.textContent = expanded ? t("collapse") : t("expand");
    toggleButton.setAttribute("aria-expanded", String(expanded));
    if (expanded) {
      expandedMorphologyTables.add(card.dataset.tableId);
    } else {
      expandedMorphologyTables.delete(card.dataset.tableId);
    }
    return;
  }

  const removeButton = event.target.closest('[data-action="remove-morphology-table"]');
  if (removeButton) {
    expandedMorphologyTables.delete(removeButton.closest(".morphology-config-card").dataset.tableId);
    removeButton.closest(".morphology-config-card").remove();
    return;
  }
  const resizeButton = event.target.closest('[data-action="resize-morphology-table"]');
  if (resizeButton) {
    const tables = collectMorphologyTables();
    renderMorphologyConfig({ morphology: { tables } });
  }
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
  appConfirm(t("ipaSyllableHelpBody"), {
    title: t("ipaSyllableHelpTitle"),
    alert: true,
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
  draggedIpaRuleId = card.dataset.ruleId || "";
  card.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedIpaRuleId);
});
elements.ipaMappingList.addEventListener("dragover", (event) => {
  const dragging = elements.ipaMappingList.querySelector(".ipa-rule-card.dragging");
  if (!dragging || !draggedIpaRuleId) {
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
elements.activateDictionaryButton.addEventListener("click", () => activateDictionary(elements.dictionaryId.value));
elements.deleteDictionaryButton.addEventListener("click", deleteSelectedDictionary);
elements.exportButton.addEventListener("click", exportData);
elements.importInput.addEventListener("change", importData);
elements.themeToggleButton.addEventListener("click", () => {
  currentTheme = currentTheme === "dark" ? "light" : "dark";
  render();
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
    showToast(t("languageSaveFailed"));
    console.error(error);
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

document.addEventListener("keydown", (event) => {
  if (event.target.matches?.("textarea.ipa-single-line") && event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    event.target.form?.requestSubmit();
    return;
  }

  if (event.key === "Escape" && confirmDialogResolver) {
    closeConfirmDialog(confirmDialogResults.cancel);
    return;
  }

  if (event.key === "Escape" && !elements.morphologySyntaxDialog.hidden) {
    elements.morphologySyntaxDialog.hidden = true;
    return;
  }

  const isSaveShortcut = (event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "s";
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

  if (state.activeView === "morphology" && !elements.morphologyForm.hidden) {
    event.preventDefault();
    elements.morphologyForm.requestSubmit();
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
  if (!effectiveEntryBrowserCollapsed("editor")) {
    requestAnimationFrame(remeasureEntryVirtualList);
  }
});
wideNavMediaQuery.addEventListener("change", renderShellNav);
window.addEventListener("resize", renderShellNav);

loadState();
