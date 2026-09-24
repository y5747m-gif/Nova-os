package os.nova.security

/**
 * NOVA SECURITY CENTER — per spec #57, #58
 * Permissions, Privacy, Encryption status, App access, Camera, Mic, Location, Notification access
 */

enum class PermissionType(val id: String, val label: String, val sensitive: Boolean) {
    Camera("camera", "الكاميرا", true),
    Microphone("microphone", "الميكروفون", true),
    Location("location", "الموقع", true),
    Contacts("contacts", "جهات الاتصال", true),
    Storage("storage", "التخزين", false),
    Notifications("notifications", "الإشعارات", false),
    Phone("phone", "الهاتف", true)
}

data class PermissionStatus(
    val type: PermissionType,
    val granted: Boolean,
    val lastUsed: Long,
    val usageCount: Int
)

data class AuditEntry(
    val id: String,
    val permissionId: String,
    val appId: String,
    val action: String,
    val timestamp: Long
)

data class EncryptionStatus(
    val enabled: Boolean,
    val type: String
)

class NovaSecurityCenter {
    
    private val permissions = mutableMapOf<String, PermissionStatus>()
    private val auditLog = mutableListOf<AuditEntry>()
    private var encryptionStatus = EncryptionStatus(true, "file-based")
    
    init {
        // Simulate permissions
        for (type in PermissionType.values()) {
            permissions[type.id] = PermissionStatus(
                type = type,
                granted = Math.random() > 0.3,
                lastUsed = System.currentTimeMillis() - (Math.random() * 86400000 * 7).toLong(),
                usageCount = (Math.random() * 50).toInt()
            )
        }
    }
    
    fun getPermissions(): List<PermissionStatus> = permissions.values.toList()
    
    fun getPermission(id: String): PermissionStatus? = permissions[id]
    
    fun getSensitivePermissions(): List<PermissionStatus> = 
        getPermissions().filter { it.type.sensitive }
    
    fun getAuditLog(limit: Int = 20): List<AuditEntry> = 
        auditLog.takeLast(limit).reversed()
    
    fun logAccess(permissionId: String, appId: String, action: String = "access") {
        val entry = AuditEntry(
            id = "log-${System.currentTimeMillis()}-${(Math.random() * 10000).toInt()}",
            permissionId = permissionId,
            appId = appId,
            action = action,
            timestamp = System.currentTimeMillis()
        )
        auditLog.add(entry)
        if (auditLog.size > 100) {
            auditLog.removeAt(0)
        }
    }
    
    fun getEncryptionStatus(): EncryptionStatus = encryptionStatus.copy()
    
    fun getPrivacySummary(): Map<String, Any> {
        val perms = getPermissions()
        val granted = perms.count { it.granted }
        val sensitiveGranted = perms.count { it.type.sensitive && it.granted }
        
        return mapOf(
            "total" to perms.size,
            "granted" to granted,
            "sensitiveGranted" to sensitiveGranted,
            "auditCount" to auditLog.size,
            "encryption" to encryptionStatus.enabled,
            "riskLevel" to when {
                sensitiveGranted > 3 -> "high"
                sensitiveGranted > 1 -> "medium"
                else -> "low"
            }
        )
    }
    
    companion object {
        val instance = NovaSecurityCenter()
    }
}
