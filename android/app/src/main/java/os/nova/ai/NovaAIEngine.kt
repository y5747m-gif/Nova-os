package os.nova.ai

/**
 * NOVA AI — per spec #37-38, #58
 * Assistant part of system, NOVA ORB interface
 * Local-first, permissions + confirmation for sensitive actions
 */

enum class AIState { Idle, Listening, Thinking, Processing, Success, Error }

data class AIAction(
    val id: String,
    val label: String,
    val intent: String,
    val needsConfirm: Boolean = false,
    val query: String? = null
)

data class AIHistoryEntry(
    val role: String, // user, assistant
    val content: String,
    val timestamp: Long,
    val action: AIAction? = null
)

class NovaAIEngine {
    
    private var state = AIState.Idle
    private val history = mutableListOf<AIHistoryEntry>()
    private val listeners = mutableSetOf<(AIState, AIState) -> Unit>()
    
    fun getState(): AIState = state
    
    fun setState(newState: AIState) {
        val prev = state
        state = newState
        for (listener in listeners.toList()) {
            try { listener(newState, prev) } catch (_: Exception) {}
        }
    }
    
    fun matchIntent(query: String): AIAction? {
        val q = query.lowercase()
        
        if (q.contains("مساحة") || q.contains("workspace")) {
            if (q.contains("آخر") || q.contains("اخير") || q.contains("last")) {
                return AIAction("openWorkspace", "افتح آخر مساحة", "openLastWorkspace")
            }
            if (q.contains("جديد") || q.contains("انشئ") || q.contains("create")) {
                return AIAction("createSpace", "أنشئ مساحة جديدة", "createSpace", true)
            }
        }
        
        if (q.contains("صورة") || q.contains("صور") || q.contains("photo")) {
            return AIAction("searchPhotos", "ابحث عن الصور", "searchPhotos", query = query)
        }
        
        if (q.contains("تطبيق") && (q.contains("فتح") || q.contains("مفتوح") || q.contains("اليوم"))) {
            return AIAction("listApps", "التطبيقات المفتوحة اليوم", "listApps")
        }
        
        if (q.contains("إعداد") || q.contains("settings")) {
            return AIAction("openSettings", "افتح الإعدادات", "openSettings")
        }
        
        if (q.contains("ابحث") || q.contains("search")) {
            return AIAction("search", "ابحث عن: $query", "search", query = query)
        }
        
        if (q.contains("مساعدة") || q.contains("help")) {
            return AIAction("help", "المساعدة", "help")
        }
        
        return null
    }
    
    fun generateResponse(action: AIAction, originalQuery: String): String {
        return when (action.intent) {
            "openLastWorkspace" -> "فتحت آخر مساحة عمل لك. تحتوي على 3 تطبيقات."
            "createSpace" -> "تم إنشاء مساحة جديدة. يمكنك إضافة التطبيقات إليها الآن."
            "searchPhotos" -> "بحثت عن الصور المتعلقة بـ \"$originalQuery\". وجدت 12 صورة."
            "listApps" -> "التطبيقات التي فتحتها اليوم: واتساب، المعرض، الموسيقى، الإعدادات."
            "openSettings" -> "فتحت الإعدادات. يمكنك تخصيص المظهر والحركة والزجاج من هنا."
            "search" -> "أبحث عن \"${action.query}\" في النظام..."
            "help" -> "أستطيع مساعدتك في: فتح المساحات، البحث عن الصور والملفات، عرض التطبيقات، وإدارة الإعدادات. كل شيء محلي وآمن."
            else -> "تم تنفيذ: ${action.label}"
        }
    }
    
    fun generateFallback(query: String): String {
        val fallbacks = listOf(
            "لم أفهم \"$query\" تماماً. جرب: \"افتح آخر مساحة\" أو \"ابحث عن الصور\".",
            "أستطيع مساعدتك في إدارة المساحات والبحث والتطبيقات. ماذا تريد أن تفعل؟",
            "عذراً، لا أستطيع تنفيذ \"$query\" حالياً. جرب صياغة أخرى."
        )
        return fallbacks.random()
    }
    
    suspend fun process(input: String, confirmed: Boolean = false): Map<String, Any> {
        if (input.isBlank()) return mapOf("type" to "error", "message" to "Empty input")
        
        addToHistory(AIHistoryEntry("user", input, System.currentTimeMillis()))
        
        setState(AIState.Thinking)
        kotlinx.coroutines.delay(600)
        setState(AIState.Processing)
        
        val result = matchIntent(input)
        kotlinx.coroutines.delay(400)
        
        return if (result != null) {
            if (result.needsConfirm && !confirmed) {
                setState(AIState.Idle)
                mapOf(
                    "type" to "confirm",
                    "message" to "هل تريد تنفيذ: ${result.label}؟",
                    "action" to result,
                    "originalQuery" to input
                )
            } else {
                setState(AIState.Success)
                val response = generateResponse(result, input)
                addToHistory(AIHistoryEntry("assistant", response, System.currentTimeMillis(), result))
                kotlinx.coroutines.delay(1000)
                setState(AIState.Idle)
                mapOf("type" to "success", "message" to response, "action" to result)
            }
        } else {
            setState(AIState.Error)
            val fallback = generateFallback(input)
            addToHistory(AIHistoryEntry("assistant", fallback, System.currentTimeMillis()))
            kotlinx.coroutines.delay(1500)
            setState(AIState.Idle)
            mapOf("type" to "error", "message" to fallback)
        }
    }
    
    private fun addToHistory(entry: AIHistoryEntry) {
        history.add(entry)
        if (history.size > 50) history.removeAt(0)
    }
    
    fun getHistory(): List<AIHistoryEntry> = history.toList()
    
    fun clearHistory() { history.clear() }
    
    fun onStateChange(listener: (AIState, AIState) -> Unit): () -> Unit {
        listeners.add(listener)
        return { listeners.remove(listener) }
    }
    
    companion object {
        val instance = NovaAIEngine()
    }
}
