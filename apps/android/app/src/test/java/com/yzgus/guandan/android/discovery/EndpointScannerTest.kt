package com.yzgus.guandan.android.discovery

import com.sun.net.httpserver.HttpServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.InetSocketAddress

class EndpointScannerTest {
    @Test
    fun `local discovery prefers wifi and ignores cellular or vpn interfaces`() {
        assertEquals(0, discoveryInterfacePriority("wlan0"))
        assertEquals(0, discoveryInterfacePriority("wifi-aware0"))
        assertEquals(1, discoveryInterfacePriority("eth0"))
        assertNull(discoveryInterfacePriority("rmnet_data0"))
        assertNull(discoveryInterfacePriority("tun0"))
    }

    @Test
    fun `cloud relay resolves and probes an endpoint`() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        val baseUrl = "http://127.0.0.1:${server.address.port}"
        server.createContext("/.well-known/guandan-lab.json") { exchange ->
            respond(exchange, """{"schemaVersion":1,"endpoints":[{"url":"${baseUrl.uppercase()}/"},"$baseUrl"]}""")
        }
        server.createContext("/health") { exchange ->
            respond(exchange, """{"ok":true,"mode":"local","rooms":2,"lastActivityAt":1700000000123}""")
        }
        server.start()
        val scanner = EndpointScanner()
        try {
            val report = scanner.scanCloud(baseUrl) { _, _ -> }
            assertEquals(1, report.scanned)
            assertEquals(1, report.found.size)
            assertEquals(EndpointState.ONLINE, report.found.single().state)
            assertEquals(setOf(EndpointSource.CLOUD), report.found.single().sources)
            assertEquals("local", report.found.single().mode)
            assertEquals(2, report.found.single().rooms)
            assertEquals(1700000000123L, report.found.single().lastActivityAtMillis)
            assertEquals(baseUrl, report.found.single().baseUrl)
        } finally {
            scanner.shutdown()
            server.stop(0)
        }
    }

    @Test
    fun `direct server works without a relay discovery document`() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        val baseUrl = "http://127.0.0.1:${server.address.port}"
        server.createContext("/health") { exchange ->
            respond(exchange, """{"ok":true,"mode":"cloud","rooms":1}""")
        }
        server.start()
        val scanner = EndpointScanner()
        try {
            val report = scanner.scanCloud(baseUrl) { _, _ -> }
            assertEquals(1, report.scanned)
            assertEquals(1, report.found.size)
            assertEquals(baseUrl, report.found.single().baseUrl)
            assertEquals(EndpointState.ONLINE, report.found.single().state)
        } finally {
            scanner.shutdown()
            server.stop(0)
        }
    }

    @Test
    fun `public relay rejects cleartext http before network access`() {
        val scanner = EndpointScanner()
        try {
            val report = scanner.scanCloud("http://example.com") { _, _ -> }
            assertTrue(report.found.isEmpty())
            assertTrue(report.note.orEmpty().contains("HTTPS"))
        } finally {
            scanner.shutdown()
        }
    }

    @Test
    fun `cloud directory rejects a public cleartext endpoint`() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        val relayUrl = "http://127.0.0.1:${server.address.port}"
        server.createContext("/.well-known/guandan-lab.json") { exchange ->
            respond(exchange, """{"schemaVersion":1,"endpoints":["http://example.com"]}""")
        }
        server.start()
        val scanner = EndpointScanner()
        try {
            val report = scanner.scanCloud(relayUrl) { _, _ -> }
            assertTrue(report.found.isEmpty())
            assertEquals(1, report.scanned)
        } finally {
            scanner.shutdown()
            server.stop(0)
        }
    }

    @Test
    fun `relay without endpoints reports an empty directory`() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/.well-known/guandan-lab.json") { exchange ->
            respond(exchange, """{"schemaVersion":1,"endpoints":[]}""")
        }
        server.start()
        val scanner = EndpointScanner()
        try {
            val report = scanner.scanCloud("http://127.0.0.1:${server.address.port}") { _, _ -> }
            assertTrue(report.found.isEmpty())
            assertTrue(report.note.orEmpty().contains("没有返回可用端点"))
        } finally {
            scanner.shutdown()
            server.stop(0)
        }
    }

    @Test
    fun `unreachable relay is reported separately from an invalid directory`() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        val relayUrl = "http://127.0.0.1:${server.address.port}"
        server.stop(0)
        val scanner = EndpointScanner()
        try {
            val report = scanner.scanCloud(relayUrl) { _, _ -> }
            assertTrue(report.found.isEmpty())
            assertTrue(report.note.orEmpty().contains("relay 不可用"))
        } finally {
            scanner.shutdown()
        }
    }

    @Test
    fun `endpoint authorization failure remains visible in cloud results`() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        val baseUrl = "http://127.0.0.1:${server.address.port}"
        server.createContext("/.well-known/guandan-lab.json") { exchange ->
            respond(exchange, """{"schemaVersion":1,"endpoints":["$baseUrl"]}""")
        }
        server.createContext("/health") { exchange ->
            exchange.sendResponseHeaders(401, -1)
            exchange.close()
        }
        server.start()
        val scanner = EndpointScanner()
        try {
            val endpoint = scanner.scanCloud(baseUrl) { _, _ -> }.found.single()
            assertEquals(EndpointState.UNAUTHORIZED, endpoint.state)
        } finally {
            scanner.shutdown()
            server.stop(0)
        }
    }

    private fun respond(exchange: com.sun.net.httpserver.HttpExchange, body: String) {
        val bytes = body.toByteArray()
        exchange.responseHeaders.add("Content-Type", "application/json")
        exchange.sendResponseHeaders(200, bytes.size.toLong())
        exchange.responseBody.use { it.write(bytes) }
    }
}
