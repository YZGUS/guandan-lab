package com.yzgus.guandan.android.discovery

enum class EndpointSource(val label: String) {
    LAN("局域网"),
    CLOUD("云端"),
}

enum class EndpointState {
    CHECKING,
    ONLINE,
    OFFLINE,
    UNAUTHORIZED,
    INVALID,
}

data class Endpoint(
    val baseUrl: String,
    val sources: Set<EndpointSource>,
    val state: EndpointState,
    val mode: String? = null,
    val rooms: Int? = null,
    val lastActivityAtMillis: Long? = null,
    val latencyMs: Long? = null,
    val detail: String? = null,
    val checkedAtMillis: Long = System.currentTimeMillis(),
)

data class EndpointScanReport(
    val source: EndpointSource,
    val scanned: Int,
    val found: List<Endpoint>,
    val note: String? = null,
)

enum class EndpointAuthenticationState(val label: String) {
    UNKNOWN("认证待验证"),
    CHECKING("正在检查认证"),
    AUTHORIZED("已授权"),
    REQUIRED("等待授权"),
    BLOCKED("权限被阻塞"),
    EXPIRED("会话已过期"),
}

data class RoomConfig(
    val roomName: String,
    val maxPlayers: Int,
    val botCount: Int,
    val startingStack: Int,
    val smallBlind: Int,
    val bigBlind: Int,
    val gameMode: String,
    val maxHands: Int?,
    val rebuyEnabled: Boolean,
    val rebuyAmount: Int,
    val maxRebuys: Int?,
)
