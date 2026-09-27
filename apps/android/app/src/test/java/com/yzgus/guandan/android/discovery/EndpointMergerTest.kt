package com.yzgus.guandan.android.discovery

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class EndpointMergerTest {
    @Test
    fun `same endpoint from both channels is deduplicated and keeps both sources`() {
        val url = "http://192.168.1.20:8788"
        val merged = EndpointMerger.merge(mapOf(
            EndpointSource.LAN to listOf(Endpoint(url, setOf(EndpointSource.LAN), EndpointState.ONLINE, mode = "local", rooms = 2, lastActivityAtMillis = 200, latencyMs = 8)),
            EndpointSource.CLOUD to listOf(Endpoint(url, setOf(EndpointSource.CLOUD), EndpointState.OFFLINE, lastActivityAtMillis = 100, latencyMs = 40, detail = "timed out")),
        ))
        assertEquals(1, merged.size)
        assertEquals(setOf(EndpointSource.LAN, EndpointSource.CLOUD), merged.getValue(url).sources)
        assertEquals(EndpointState.ONLINE, merged.getValue(url).state)
        assertEquals("local", merged.getValue(url).mode)
        assertEquals(2, merged.getValue(url).rooms)
        assertEquals(200L, merged.getValue(url).lastActivityAtMillis)
        assertEquals(8L, merged.getValue(url).latencyMs)
    }

    @Test
    fun `replacing one channel report removes its stale endpoint`() {
        val reports = mutableMapOf<EndpointSource, List<Endpoint>>()
        reports[EndpointSource.CLOUD] = listOf(Endpoint("https://old.example", setOf(EndpointSource.CLOUD), EndpointState.ONLINE))
        assertEquals(1, EndpointMerger.merge(reports).size)
        reports[EndpointSource.CLOUD] = emptyList()
        assertFalse(EndpointMerger.merge(reports).containsKey("https://old.example"))
    }
}
