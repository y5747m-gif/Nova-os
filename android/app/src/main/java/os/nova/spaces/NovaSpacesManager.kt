package os.nova.spaces

/**
 * NOVA SPACES — per spec #27-28, #58
 * Workspaces: Work, Travel, Study, Gaming, Personal
 * Each contains: Apps, Files, People, Notes, Actions
 * Animation: Depth Zoom + Parallax + Morph + Reveal 300-500ms
 */

data class NovaSpace(
    val id: String,
    val name: String,
    val icon: String,
    val color: String,
    val apps: MutableList<String> = mutableListOf(),
    val files: MutableList<String> = mutableListOf(),
    val people: MutableList<String> = mutableListOf(),
    val notes: MutableList<String> = mutableListOf(),
    val actions: MutableList<String> = mutableListOf(),
    val created: Long = System.currentTimeMillis()
)

class NovaSpacesManager {
    
    private val spaces = mutableListOf<NovaSpace>()
    private var currentSpaceId: String = "work"
    private val listeners = mutableSetOf<(String, Any) -> Unit>()
    
    init {
        // Default spaces
        spaces.addAll(
            listOf(
                NovaSpace("work", "العمل", "briefcase", "#6C5CE7"),
                NovaSpace("personal", "شخصي", "person", "#FF6B9A"),
                NovaSpace("study", "الدراسة", "book", "#4ADE80"),
                NovaSpace("travel", "السفر", "map", "#22D3EE"),
                NovaSpace("gaming", "الألعاب", "game", "#F5A524")
            )
        )
    }
    
    fun getSpaces(): List<NovaSpace> = spaces.toList()
    
    fun getSpace(id: String): NovaSpace? = spaces.find { it.id == id }
    
    fun getCurrentSpace(): NovaSpace? = getSpace(currentSpaceId)
    
    fun createSpace(name: String, icon: String = "layers", color: String = "#6C5CE7"): NovaSpace {
        val space = NovaSpace(
            id = "space-${System.currentTimeMillis()}",
            name = name,
            icon = icon,
            color = color
        )
        spaces.add(space)
        notify("create", space)
        return space
    }
    
    fun deleteSpace(id: String): Boolean {
        if (spaces.size <= 1) return false
        val index = spaces.indexOfFirst { it.id == id }
        if (index == -1) return false
        spaces.removeAt(index)
        if (currentSpaceId == id) {
            currentSpaceId = spaces.first().id
        }
        notify("delete", id)
        return true
    }
    
    fun switchSpace(id: String): Boolean {
        val space = getSpace(id) ?: return false
        val prev = currentSpaceId
        currentSpaceId = id
        notify("switch", mapOf("from" to prev, "to" to id, "space" to space))
        return true
    }
    
    fun addAppToSpace(spaceId: String, appId: String): Boolean {
        val space = getSpace(spaceId) ?: return false
        if (!space.apps.contains(appId)) {
            space.apps.add(appId)
            notify("appAdd", mapOf("spaceId" to spaceId, "appId" to appId))
        }
        return true
    }
    
    fun onChange(listener: (String, Any) -> Unit): () -> Unit {
        listeners.add(listener)
        return { listeners.remove(listener) }
    }
    
    private fun notify(type: String, data: Any) {
        for (listener in listeners.toList()) {
            try { listener(type, data) } catch (_: Exception) {}
        }
    }
    
    companion object {
        val instance = NovaSpacesManager()
    }
}
