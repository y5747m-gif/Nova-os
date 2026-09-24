package os.nova.find

/**
 * NOVA FIND — per spec #35-36
 * Glass Orb → Search Surface, Apps, Files, Contacts, Photos, Messages, Settings, Spaces, Actions
 */

enum class SearchCategory { Apps, Files, Contacts, Photos, Messages, Settings, Spaces, Actions }

data class SearchItem(
    val id: String,
    val type: SearchCategory,
    val title: String,
    val subtitle: String,
    val keywords: String,
    val priority: Int,
    val score: Int = 0
)

data class SearchResults(
    val relevant: List<SearchItem>,
    val secondary: List<SearchItem>,
    val other: List<SearchItem>,
    val all: List<SearchItem>
)

class NovaFindEngine {
    
    private val index = mutableMapOf<String, SearchItem>()
    private val history = mutableListOf<String>()
    
    init {
        // Index would be built from real apps, contacts, etc.
    }
    
    fun search(query: String): SearchResults {
        if (query.isBlank()) {
            return SearchResults(emptyList(), emptyList(), emptyList(), emptyList())
        }
        
        val q = query.lowercase().trim()
        val results = mutableListOf<SearchItem>()
        
        for (item in index.values) {
            var score = 0
            if (item.title.lowercase() == q) score += 100
            else if (item.title.lowercase().startsWith(q)) score += 80
            else if (item.title.lowercase().contains(q)) score += 60
            if (item.keywords.contains(q)) score += 40
            
            if (score > 0) {
                results.add(item.copy(score = score))
            }
        }
        
        results.sortByDescending { it.score }
        
        return SearchResults(
            relevant = results.filter { it.score >= 60 }.take(5),
            secondary = results.filter { it.score in 30..59 }.take(5),
            other = results.filter { it.score < 30 }.take(8),
            all = results
        )
    }
    
    fun addToHistory(itemId: String) {
        history.remove(itemId)
        history.add(0, itemId)
        if (history.size > 20) history.removeAt(history.size - 1)
    }
    
    companion object {
        val instance = NovaFindEngine()
    }
}
