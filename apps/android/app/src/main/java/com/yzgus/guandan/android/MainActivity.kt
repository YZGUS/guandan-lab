package com.yzgus.guandan.android

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.window.OnBackInvokedDispatcher
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import com.yzgus.guandan.android.discovery.Endpoint
import com.yzgus.guandan.android.discovery.EndpointMerger
import com.yzgus.guandan.android.discovery.EndpointScanReport
import com.yzgus.guandan.android.discovery.EndpointScanner
import com.yzgus.guandan.android.discovery.EndpointSource
import com.yzgus.guandan.android.discovery.EndpointState
import java.net.URL
import java.text.DateFormat
import java.util.Date
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

class MainActivity : Activity() {
    private val ink = Color.rgb(4, 16, 13)
    private val panel = Color.rgb(8, 26, 20)
    private val gold = Color.rgb(230, 195, 109)
    private val green = Color.rgb(113, 215, 170)
    private val cream = Color.rgb(245, 241, 232)
    private val muted = Color.rgb(140, 160, 151)
    private val line = Color.argb(34, 255, 255, 255)
    private val danger = Color.rgb(229, 138, 126)

    private lateinit var root: FrameLayout
    private lateinit var discoveryView: View
    private lateinit var serverInput: EditText
    private lateinit var progress: TextView
    private lateinit var progressBar: ProgressBar
    private lateinit var results: LinearLayout
    private lateinit var lanButton: Button
    private lateinit var cloudButton: Button
    private lateinit var bothButton: Button
    private val scanner = EndpointScanner()
    private val scanExecutor = Executors.newFixedThreadPool(2)
    private val reports = mutableMapOf<EndpointSource, List<Endpoint>>()
    private val activeScans = AtomicInteger(0)
    private var webView: WebView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = ink
        window.navigationBarColor = ink
        root = FrameLayout(this).apply { setBackgroundColor(ink) }
        discoveryView = buildDiscoveryView()
        root.addView(discoveryView, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)
        if (Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) { handleBack() }
        }
    }

    private fun buildDiscoveryView(): View {
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(24), dp(18), dp(30))
        }
        content.addView(text("GUANDAN LAB · ANDROID", 11f, gold, Typeface.DEFAULT_BOLD).apply { letterSpacing = .12f })
        content.addView(text("找到牌桌，立即开打", 28f, cream, Typeface.DEFAULT_BOLD).apply { setPadding(0, dp(8), 0, 0) })
        content.addView(text("扫描当前局域网，或连接你的云端 Guandan Lab。选定后加载同一套 Web 牌桌。", 13f, muted).apply { setPadding(0, dp(8), 0, dp(18)) })

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(14), dp(14), dp(14))
            background = rounded(panel, line, 18)
        }
        card.addView(text("服务器或 relay 地址", 12f, cream, Typeface.DEFAULT_BOLD))
        serverInput = EditText(this).apply {
            setText(getPreferences(MODE_PRIVATE).getString("cloud-url", ""))
            hint = "https://cards.example.com"
            setHintTextColor(Color.rgb(87, 108, 98))
            setTextColor(cream)
            textSize = 13f
            setSingleLine(true)
            setPadding(dp(12), 0, dp(12), 0)
            background = rounded(Color.argb(14, 255, 255, 255), line, 11)
        }
        card.addView(serverInput, LinearLayout.LayoutParams(-1, dp(48)).apply { topMargin = dp(8) })

        val buttons = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        lanButton = actionButton("扫描局域网", false) { scan(setOf(EndpointSource.LAN)) }
        cloudButton = actionButton("扫描云端", false) { scan(setOf(EndpointSource.CLOUD)) }
        bothButton = actionButton("同时扫描", true) { scan(setOf(EndpointSource.LAN, EndpointSource.CLOUD)) }
        buttons.addView(lanButton, weight())
        buttons.addView(cloudButton, weight(dp(7)))
        buttons.addView(bothButton, weight(dp(7)))
        card.addView(buttons, LinearLayout.LayoutParams(-1, dp(46)).apply { topMargin = dp(10) })
        content.addView(card, matchWrap())

        val status = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(2), dp(14), dp(2), dp(10)) }
        progressBar = ProgressBar(this).apply { visibility = View.GONE }
        status.addView(progressBar, LinearLayout.LayoutParams(dp(22), dp(22)))
        progress = text("尚未扫描", 12f, muted).apply { setPadding(dp(8), 0, 0, 0) }
        status.addView(progress, LinearLayout.LayoutParams(0, -2, 1f))
        content.addView(status, matchWrap())

        results = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        content.addView(results, matchWrap())
        showEmptyResults()
        return ScrollView(this).apply { isFillViewport = true; addView(content, FrameLayout.LayoutParams(-1, -2)) }
    }

    private fun scan(sources: Set<EndpointSource>) {
        if (sources.contains(EndpointSource.CLOUD)) {
            getPreferences(MODE_PRIVATE).edit().putString("cloud-url", serverInput.text.toString().trim()).apply()
        }
        setScanning(true, "准备扫描…")
        sources.forEach { source ->
            activeScans.incrementAndGet()
            scanExecutor.execute {
                val report = when (source) {
                    EndpointSource.LAN -> scanner.scanLan { completed, total -> updateProgress("局域网搜索 $completed/$total") }
                    EndpointSource.CLOUD -> scanner.scanCloud(serverInput.text.toString()) { completed, total -> updateProgress("云端搜索 $completed/$total") }
                }
                runOnUiThread { completeScan(report) }
            }
        }
    }

    private fun completeScan(report: EndpointScanReport) {
        reports[report.source] = report.found
        renderResults()
        if (activeScans.decrementAndGet() == 0) {
            val total = EndpointMerger.merge(reports).size
            setScanning(false, report.note ?: if (total > 0) "找到 $total 个可用牌桌" else "没有发现可用牌桌")
        }
    }

    private fun updateProgress(message: String) {
        runOnUiThread { progress.text = message }
    }

    private fun setScanning(scanning: Boolean, message: String) {
        lanButton.isEnabled = !scanning
        cloudButton.isEnabled = !scanning
        bothButton.isEnabled = !scanning
        progressBar.visibility = if (scanning) View.VISIBLE else View.GONE
        progress.text = message
        progress.setTextColor(if (scanning) gold else muted)
    }

    private fun renderResults() {
        results.removeAllViews()
        val endpoints = EndpointMerger.merge(reports).values.toList()
        if (endpoints.isEmpty()) { showEmptyResults(); return }
        endpoints.forEach { endpoint ->
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(14), dp(12), dp(14), dp(12))
                background = rounded(Color.argb(9, 255, 255, 255), line, 14)
                isClickable = true
                setOnClickListener { if (endpoint.state == EndpointState.ONLINE || endpoint.state == EndpointState.UNAUTHORIZED) openGame(endpoint.baseUrl) }
            }
            val header = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            header.addView(text(endpoint.sources.joinToString(" + ") { it.label }, 11f, if (EndpointSource.LAN in endpoint.sources) green else gold, Typeface.DEFAULT_BOLD), LinearLayout.LayoutParams(0, -2, 1f))
            header.addView(text(statusLabel(endpoint.state), 11f, statusColor(endpoint.state), Typeface.DEFAULT_BOLD))
            row.addView(header, matchWrap())
            row.addView(text(endpoint.baseUrl, 14f, cream, Typeface.MONOSPACE).apply { setPadding(0, dp(7), 0, 0) }, matchWrap())
            val detail = buildString {
                endpoint.mode?.let { append(if (it == "local") "本地服务" else "云端服务") }
                endpoint.rooms?.let { append(if (isNotEmpty()) " · " else ""); append("$it 个房间") }
                endpoint.latencyMs?.let { append(if (isNotEmpty()) " · " else ""); append("${it}ms") }
                endpoint.detail?.let { append(if (isNotEmpty()) " · " else ""); append(it) }
                append(" · "); append(DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(endpoint.checkedAtMillis)))
            }
            row.addView(text(detail, 11f, muted), matchWrap())
            results.addView(row, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(8) })
        }
    }

    private fun showEmptyResults() {
        results.removeAllViews()
        results.addView(text("还没有发现牌桌\n你也可以直接输入服务器地址后扫描云端。", 13f, muted).apply {
            gravity = Gravity.CENTER
            setPadding(dp(12), dp(32), dp(12), dp(32))
            background = rounded(Color.argb(5, 255, 255, 255), line, 14, dashed = true)
        }, matchWrap())
    }

    private fun openGame(baseUrl: String) {
        val allowed = URL(baseUrl)
        val browser = WebView(this).apply {
            setBackgroundColor(ink)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.javaScriptCanOpenWindowsAutomatically = false
            CookieManager.getInstance().setAcceptCookie(true)
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    val target = request?.url ?: return true
                    return !(target.scheme == allowed.protocol && target.host == allowed.host && effectivePort(target.scheme, target.port) == effectivePort(allowed.protocol, allowed.port))
                }
            }
            loadUrl(baseUrl)
        }
        webView = browser
        root.removeAllViews()
        root.addView(browser, FrameLayout.LayoutParams(-1, -1))
    }

    @Deprecated("Deprecated in Java")
    @SuppressLint("GestureBackNavigation")
    override fun onBackPressed() {
        handleBack()
    }

    private fun handleBack() {
        val browser = webView
        when {
            browser == null -> finish()
            browser.canGoBack() -> browser.goBack()
            else -> {
                browser.destroy()
                webView = null
                root.removeAllViews()
                root.addView(discoveryView, FrameLayout.LayoutParams(-1, -1))
            }
        }
    }

    override fun onDestroy() {
        scanner.shutdown()
        scanExecutor.shutdownNow()
        webView?.destroy()
        super.onDestroy()
    }

    private fun actionButton(label: String, primary: Boolean, action: () -> Unit) = Button(this).apply {
        text = label
        textSize = 11f
        setTextColor(if (primary) ink else cream)
        isAllCaps = false
        background = rounded(if (primary) gold else Color.argb(10, 255, 255, 255), if (primary) gold else line, 11)
        setOnClickListener { action() }
    }

    private fun text(value: String, size: Float, color: Int, face: Typeface = Typeface.DEFAULT) = TextView(this).apply {
        text = value
        textSize = size
        setTextColor(color)
        typeface = face
        setLineSpacing(0f, 1.2f)
    }

    private fun rounded(fill: Int, stroke: Int, radius: Int, dashed: Boolean = false) = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        setColor(fill)
        cornerRadius = dp(radius).toFloat()
        if (dashed) setStroke(dp(1), stroke, dp(6).toFloat(), dp(5).toFloat()) else setStroke(dp(1), stroke)
    }

    private fun matchWrap() = LinearLayout.LayoutParams(-1, -2)
    private fun weight(startMargin: Int = 0) = LinearLayout.LayoutParams(0, -1, 1f).apply { marginStart = startMargin }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun statusLabel(state: EndpointState) = when (state) {
        EndpointState.ONLINE -> "在线"
        EndpointState.UNAUTHORIZED -> "需要邀请码"
        EndpointState.CHECKING -> "检查中"
        EndpointState.OFFLINE -> "离线"
        EndpointState.INVALID -> "无效"
    }
    private fun statusColor(state: EndpointState) = when (state) {
        EndpointState.ONLINE -> green
        EndpointState.UNAUTHORIZED, EndpointState.CHECKING -> gold
        EndpointState.OFFLINE, EndpointState.INVALID -> danger
    }
    private fun effectivePort(scheme: String?, port: Int) = if (port != -1) port else if (scheme == "https") 443 else 80
}
