package com.yzgus.guandan.android.discovery

import java.io.IOException
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.URL
import java.util.Collections
import java.util.concurrent.Callable
import java.util.concurrent.ExecutorCompletionService
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit
import java.util.regex.Pattern
import org.json.JSONObject

class EndpointScanner(
    private val executor: ExecutorService = Executors.newFixedThreadPool(24),
) {
    private val okPattern = Pattern.compile("\\\"ok\\\"\\s*:\\s*true")
    private val modePattern = Pattern.compile("\\\"mode\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"")
    private val roomsPattern = Pattern.compile("\\\"rooms\\\"\\s*:\\s*(\\d+)")
    private val lastActivityPattern = Pattern.compile("\\\"lastActivityAt\\\"\\s*:\\s*(\\d+)")

    fun scanLan(onProgress: (completed: Int, total: Int) -> Unit): EndpointScanReport {
        val subnet = localSubnet() ?: return EndpointScanReport(
            source = EndpointSource.LAN,
            scanned = 0,
            found = emptyList(),
            note = "无法读取当前 Wi-Fi 网段，请确认局域网权限或改用云端扫描。",
        )
        val candidates = subnet.hosts.map { "http://$it:8788" }
        val found = scanCandidates(candidates, EndpointSource.LAN, onProgress)
        return EndpointScanReport(
            source = EndpointSource.LAN,
            scanned = candidates.size,
            found = found,
            note = "已检查 ${subnet.interfaceName} · ${subnet.address}/24",
        )
    }

    fun scanCloud(rawUrls: String, onProgress: (completed: Int, total: Int) -> Unit): EndpointScanReport {
        val rawConfiguredUrls = rawUrls.split(',', '\n', ' ', '\t').filter { it.isNotBlank() }
        val configuredUrls = rawConfiguredUrls
            .map { normalizeRelayUrl(it) }
            .mapNotNull { it }
            .distinct()
        if (configuredUrls.isEmpty()) {
            return EndpointScanReport(
                source = EndpointSource.CLOUD,
                scanned = 0,
                found = emptyList(),
                note = if (rawConfiguredUrls.isEmpty()) {
                    "请输入一个或多个用户自有服务器或 relay 地址。"
                } else {
                    "服务器与 relay 必须使用 HTTPS；仅本机或私有网段调试地址可使用 HTTP。"
                },
            )
        }
        val directResults = scanCandidates(configuredUrls, EndpointSource.CLOUD, onProgress, includeFailures = true)
        val directEndpoints = directResults.filter { it.state == EndpointState.ONLINE || it.state == EndpointState.UNAUTHORIZED }
        val directUrls = directEndpoints.mapTo(mutableSetOf()) { it.baseUrl }
        val resolved = configuredUrls.map { it to resolveRelay(it) }
        val directoryUrls = resolved.flatMap { it.second.endpoints }.distinct().take(100)
        val directoryResults = scanCandidates(directoryUrls.filterNot(directUrls::contains), EndpointSource.CLOUD, onProgress, includeFailures = true)
        val found = (directEndpoints + directoryResults).distinctBy { it.baseUrl }
        val errors = resolved.mapNotNull { (url, resolution) -> resolution.error.takeIf { url !in directUrls } }
        if (found.isEmpty()) {
            return EndpointScanReport(
                source = EndpointSource.CLOUD,
                scanned = (configuredUrls + directoryUrls).distinct().size,
                found = emptyList(),
                note = errors.joinToString("；").ifBlank { "服务器或 relay 没有返回可用端点。" },
            )
        }
        return EndpointScanReport(
            source = EndpointSource.CLOUD,
            scanned = (configuredUrls + directoryUrls).distinct().size,
            found = found,
            note = buildString {
                append("已识别 ${directEndpoints.size} 个直接服务器")
                if (directoryUrls.isNotEmpty()) append("，并从 relay 解析到 ${directoryUrls.size} 个端点")
                append("。")
                if (errors.isNotEmpty()) append(" ${errors.joinToString("；")}")
            },
        )
    }

    fun shutdown() {
        executor.shutdownNow()
    }

    private fun scanCandidates(
        candidates: List<String>,
        source: EndpointSource,
        onProgress: (completed: Int, total: Int) -> Unit,
        includeFailures: Boolean = false,
    ): List<Endpoint> {
        if (candidates.isEmpty()) return emptyList()
        val completed = java.util.concurrent.atomic.AtomicInteger(0)
        val completion = ExecutorCompletionService<Pair<Endpoint, Int>>(executor)
        val futures = candidates.map { baseUrl ->
            completion.submit(Callable { probe(baseUrl, source) to completed.incrementAndGet() })
        }
        val found = mutableListOf<Endpoint>()
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(12)
        return try {
            repeat(candidates.size) {
                val remaining = deadline - System.nanoTime()
                if (remaining <= 0) return@repeat
                val future = completion.poll(remaining, TimeUnit.NANOSECONDS) ?: return@repeat
                val (endpoint, count) = future.getOrNull() ?: return@repeat
                onProgress(count, candidates.size)
                if (includeFailures || endpoint.state == EndpointState.ONLINE) found += endpoint
            }
            found
                .distinctBy { it.baseUrl }
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
            emptyList()
        } finally {
            futures.filterNot(Future<*>::isDone).forEach { it.cancel(true) }
        }
    }

    private fun probe(baseUrl: String, source: EndpointSource): Endpoint {
        val startedAt = System.nanoTime()
        val connection = try {
            (URL("$baseUrl/health").openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 650
                readTimeout = 900
                instanceFollowRedirects = false
                useCaches = false
            }
        } catch (error: Exception) {
            return Endpoint(baseUrl, setOf(source), EndpointState.INVALID, detail = error.message ?: "地址无效")
        }
        return try {
            val code = connection.responseCode
            val body = (if (code in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            val elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt)
            if (!okPattern.matcher(body).find()) {
                Endpoint(baseUrl, setOf(source), if (code == 401 || code == 403) EndpointState.UNAUTHORIZED else EndpointState.INVALID, latencyMs = elapsed, detail = "健康检查响应无效（HTTP $code）")
            } else {
                Endpoint(
                    baseUrl = baseUrl,
                    sources = setOf(source),
                    state = EndpointState.ONLINE,
                    mode = modePattern.matcher(body).takeIf { it.find() }?.group(1),
                    rooms = roomsPattern.matcher(body).takeIf { it.find() }?.group(1)?.toIntOrNull(),
                    lastActivityAtMillis = lastActivityPattern.matcher(body).takeIf { it.find() }?.group(1)?.toLongOrNull(),
                    latencyMs = elapsed,
                    detail = "健康检查通过",
                )
            }
        } catch (error: IOException) {
            Endpoint(baseUrl, setOf(source), EndpointState.OFFLINE, detail = error.message ?: "无法连接")
        } finally {
            connection.disconnect()
        }
    }

    private fun Future<Pair<Endpoint, Int>>.getOrNull(): Pair<Endpoint, Int>? = try {
        get()
    } catch (_: Exception) {
        null
    }

    private fun normalizeBaseUrl(raw: String): String? {
        val value = raw.trim()
        if (value.isBlank()) return null
        return try {
            val url = URL(value)
            if (url.protocol != "http" && url.protocol != "https") return null
            if (url.userInfo != null || url.query != null || url.ref != null || url.host.isBlank()) return null
            val protocol = url.protocol.lowercase()
            val host = url.host.lowercase().let { if (':' in it && !it.startsWith("[")) "[$it]" else it }
            val defaultPort = (protocol == "http" && url.port == 80) || (protocol == "https" && url.port == 443)
            val port = if (url.port == -1 || defaultPort) "" else ":${url.port}"
            val path = url.path.trimEnd('/').takeUnless { it.isBlank() || it == "/" }.orEmpty()
            "$protocol://$host$port$path"
        } catch (_: Exception) {
            null
        }
    }

    private fun normalizeRelayUrl(raw: String): String? {
        val value = normalizeBaseUrl(raw) ?: return null
        val url = URL(value)
        return value.takeIf { url.protocol == "https" || isPrivateDevelopmentHost(url.host) }
    }

    private fun normalizeCloudEndpointUrl(raw: String): String? {
        val value = normalizeBaseUrl(raw) ?: return null
        val url = URL(value)
        return value.takeIf { url.protocol == "https" || isPrivateDevelopmentHost(url.host) }
    }

    private fun isPrivateDevelopmentHost(host: String): Boolean {
        val value = host.removePrefix("[").removeSuffix("]").lowercase()
        if (value == "localhost" || value == "::1" || value.startsWith("127.")) return true
        val octets = value.split('.').mapNotNull(String::toIntOrNull)
        if (octets.size != 4 || octets.any { it !in 0..255 }) return false
        return octets[0] == 10
            || (octets[0] == 172 && octets[1] in 16..31)
            || (octets[0] == 192 && octets[1] == 168)
    }

    private fun resolveRelay(baseUrl: String): RelayResolution {
        val connection = try {
            (URL("$baseUrl/.well-known/guandan-lab.json").openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 2_500
                readTimeout = 3_500
                instanceFollowRedirects = false
                useCaches = false
            }
        } catch (error: Exception) {
            return RelayResolution(error = "$baseUrl：${error.message ?: "地址无效"}")
        }
        return try {
            val code = connection.responseCode
            if (code !in 200..299) return RelayResolution(error = "$baseUrl：目录 HTTP $code")
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            val document = JSONObject(body)
            if (document.optInt("schemaVersion") != 1) return RelayResolution(error = "$baseUrl：不支持的目录版本")
            val array = document.optJSONArray("endpoints")
                ?: return RelayResolution(error = "$baseUrl：目录缺少 endpoints")
            val endpoints = buildList {
                for (index in 0 until array.length().coerceAtMost(100)) {
                    val item = array.opt(index)
                    val raw = when (item) {
                        is String -> item
                        is JSONObject -> item.optString("url")
                        else -> ""
                    }
                    normalizeCloudEndpointUrl(raw)?.let(::add)
                }
            }.distinct()
            RelayResolution(endpoints = endpoints)
        } catch (error: IOException) {
            RelayResolution(error = "$baseUrl：relay 不可用（${error.message ?: "无法连接"}）")
        } catch (error: Exception) {
            RelayResolution(error = "$baseUrl：目录格式无效（${error.message ?: "解析失败"}）")
        } finally {
            connection.disconnect()
        }
    }

    private fun localSubnet(): LocalSubnet? {
        val interfaces = Collections.list(NetworkInterface.getNetworkInterfaces())
        val candidates = interfaces.asSequence()
            .filter { it.isUp && !it.isLoopback && !it.isVirtual && discoveryInterfacePriority(it.name) != null }
            .flatMap { networkInterface ->
                Collections.list(networkInterface.inetAddresses).asSequence()
                    .filterIsInstance<Inet4Address>()
                    .filter { !it.isLoopbackAddress && !it.isLinkLocalAddress }
                    .map { address -> InterfaceCandidate(networkInterface, address) }
            }
            .toList()
            .sortedWith(compareBy<InterfaceCandidate>({ discoveryInterfacePriority(it.networkInterface.name) ?: Int.MAX_VALUE }, { if (isPrivateIpv4(it.address)) 0 else 1 }))
        val selected = candidates.firstOrNull { isPrivateIpv4(it.address) } ?: candidates.firstOrNull()
            ?: return null
        val address = selected.address
        val raw = address.address.fold(0L) { acc, byte -> (acc shl 8) or (byte.toInt() and 0xff).toLong() }
        val subnetBase = raw and 0xffff_ff00L
        val hosts = (1..254).map { index ->
            listOf(
                (subnetBase shr 24) and 0xff,
                (subnetBase shr 16) and 0xff,
                (subnetBase shr 8) and 0xff,
                index.toLong(),
            ).joinToString(".")
        }
        return LocalSubnet(
            hosts = hosts,
            interfaceName = selected.networkInterface.name,
            address = address.hostAddress.orEmpty(),
        )
    }

    private fun isPrivateIpv4(address: Inet4Address): Boolean {
        val bytes = address.address.map { it.toInt() and 0xff }
        return bytes[0] == 10
            || (bytes[0] == 172 && bytes[1] in 16..31)
            || (bytes[0] == 192 && bytes[1] == 168)
    }

    private data class InterfaceCandidate(val networkInterface: NetworkInterface, val address: Inet4Address)
    private data class LocalSubnet(val hosts: List<String>, val interfaceName: String, val address: String)
    private data class RelayResolution(val endpoints: List<String> = emptyList(), val error: String? = null)
}

internal fun discoveryInterfacePriority(name: String): Int? {
    val normalized = name.lowercase()
    return when {
        normalized.startsWith("wlan") || normalized.contains("wifi") -> 0
        normalized.startsWith("eth") || normalized.startsWith("en") -> 1
        else -> null
    }
}
