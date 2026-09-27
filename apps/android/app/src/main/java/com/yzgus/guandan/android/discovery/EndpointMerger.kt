package com.yzgus.guandan.android.discovery

object EndpointMerger {
    fun merge(reports: Map<EndpointSource, List<Endpoint>>): LinkedHashMap<String, Endpoint> {
        val merged = linkedMapOf<String, Endpoint>()
        reports.values.flatten().forEach { incoming ->
            val existing = merged[incoming.baseUrl]
            merged[incoming.baseUrl] = if (existing == null) incoming else {
                val preferred = when {
                    existing.state == EndpointState.ONLINE && incoming.state != EndpointState.ONLINE -> existing
                    incoming.state == EndpointState.ONLINE && existing.state != EndpointState.ONLINE -> incoming
                    existing.checkedAtMillis > incoming.checkedAtMillis -> existing
                    else -> incoming
                }
                preferred.copy(
                    sources = existing.sources + incoming.sources,
                    latencyMs = listOfNotNull(existing.latencyMs, incoming.latencyMs).minOrNull(),
                    lastActivityAtMillis = listOfNotNull(existing.lastActivityAtMillis, incoming.lastActivityAtMillis).maxOrNull(),
                    checkedAtMillis = maxOf(existing.checkedAtMillis, incoming.checkedAtMillis),
                )
            }
        }
        return merged
    }
}
