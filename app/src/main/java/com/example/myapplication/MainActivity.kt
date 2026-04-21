package com.example.myapplication
import android.os.Bundle
import android.util.Log
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebResourceError
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.background
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.viewinterop.AndroidView
import com.example.myapplication.ui.theme.MyApplicationTheme
import android.webkit.WebChromeClient
import android.webkit.ConsoleMessage
import androidx.webkit.WebViewAssetLoader
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.net.Uri
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant
import java.time.temporal.ChronoUnit
import kotlinx.coroutines.*
import androidx.activity.viewModels
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    private var healthConnectClient: HealthConnectClient? = null
    private lateinit var webView: WebView
    private val mainScope = MainScope()

    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null

    private val chatViewModel: ChatViewModel by viewModels()
    private val localModelFileName = "gemma4_final_q4km.gguf"

    private val fileChooserLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (fileUploadCallback == null) return@registerForActivityResult
        val resultCode = result.resultCode
        val data = result.data
        if (resultCode == Activity.RESULT_OK && data != null) {
            val clipData = data.clipData
            if (clipData != null) {
                // multiple file
                val uris = (0 until clipData.itemCount).mapNotNull { clipData.getItemAt(it).uri }.toTypedArray()
                fileUploadCallback?.onReceiveValue(uris)
            } else {
                // single file
                val uri = data.data
                if (uri != null) {
                    fileUploadCallback?.onReceiveValue(arrayOf(uri))
                } else {
                    fileUploadCallback?.onReceiveValue(null)
                }
            }
        } else {
            fileUploadCallback?.onReceiveValue(null)
        }
        fileUploadCallback = null
    }
    private val requestPermissionsLauncher = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { granted ->
        Log.d("HealthConnect", "Permissions result: $granted")
        val required = HealthPermission.getReadPermission(HeartRateRecord::class)
        if (granted.contains(required)) {
            Log.d("HealthConnect", "✅ Heart rate permission granted")
            webView.loadUrl("javascript:window.onHealthPermissionsGranted()")
        } else {
            Log.w("HealthConnect", "❌ Heart rate permission denied")
            webView.loadUrl("javascript:window.onHealthPermissionsDenied()")
        }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.d("FITMIND_DEBUG", "🏁 MainActivity onCreate called")
        if (HealthConnectClient.getSdkStatus(this) == HealthConnectClient.SDK_AVAILABLE) {
            healthConnectClient = HealthConnectClient.getOrCreate(this)
            Log.d("HealthConnect", "Client initialized")
        } else {
            Log.e("HealthConnect", "SDK not available")
        }

        setContent {
            // FORCE light theme and disable dynamic color to prevent dark overlay
            MyApplicationTheme(
                darkTheme = false,
                dynamicColor = false
            ) {
                WebViewScreen(modifier = Modifier.fillMaxSize())
            }
        }

        // load local model
        val modelFile = java.io.File(getExternalFilesDir(null), localModelFileName)

        // debug
        if (modelFile.exists()) {
            val fileSize = modelFile.length()
            Log.d("LocalModelCheck", "model found. file size : ${fileSize / (1024 * 1024)} MB")
            // initialize model
            chatViewModel.initializeModel(this, modelFile.absolutePath)
        } else {
            Log.d("LocalModelCheck", "cannot find the model file in expected path: ${modelFile.absolutePath}")
        }
    }

    fun setupWebView(webView: WebView) {
        this.webView = webView
        webView.addJavascriptInterface(HealthConnectInterface(), "AndroidHealth")
        webView.addJavascriptInterface(LocalLlmInterface(), "AndroidLocalLLM")
        webView.webChromeClient = WebChromeClient()
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileUploadCallback = filePathCallback
                val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "video/*"   // only video file
                }
                fileChooserLauncher.launch(intent)
                return true
            }
        }
    }

    inner class HealthConnectInterface() {
        @JavascriptInterface
        fun checkAvailability(): Boolean = healthConnectClient != null

        @JavascriptInterface
        fun requestPermissions() {
            runOnUiThread {
                requestPermissionsLauncher.launch(setOf(HealthPermission.getReadPermission(HeartRateRecord::class)))
            }
        }
        @JavascriptInterface
        fun getLatestHeartRate(callbackId: String) {
            if (healthConnectClient == null) {
                runOnUiThread {
                    webView.loadUrl("javascript:window.onHeartRateError('Client not available', '$callbackId')")
                }
                return
            }


            mainScope.launch {
                try {
                    val now = Instant.now()
                    val request = ReadRecordsRequest(
                        recordType = HeartRateRecord::class,
                        timeRangeFilter = TimeRangeFilter.between(now.minus(1, ChronoUnit.DAYS), now)
                    )
                    val response = healthConnectClient!!.readRecords(request)
                    val latest = response.records.maxByOrNull { it.startTime }
                    val hr = latest?.samples?.lastOrNull()?.beatsPerMinute ?: 0
                    runOnUiThread {
                        webView.loadUrl("javascript:window.onHeartRateUpdate($hr, '$callbackId')")
                    }
                } catch (e: Exception) {
                    runOnUiThread {
                        webView.loadUrl("javascript:window.onHeartRateError('${e.message}', '$callbackId')")
                    }
                }
            }
        }

    }

    inner class LocalLlmInterface {
        @JavascriptInterface
        fun isModelReady(): Boolean = chatViewModel.isReady()

        @JavascriptInterface
        fun initializeModelIfNeeded() {
            val modelFile = java.io.File(getExternalFilesDir(null), localModelFileName)
            if (!modelFile.exists()) {
                dispatchLocalLlmError("", "Model file not found: ${modelFile.absolutePath}")
                return
            }
            chatViewModel.initializeModelIfNeeded(this@MainActivity, modelFile.absolutePath)
        }

        @JavascriptInterface
        fun sendMessage(message: String, callbackId: String) {
            chatViewModel.sendMessageForWeb(
                userContent = message,
                onToken = { token -> dispatchLocalLlmToken(callbackId, token) },
                onComplete = { full -> dispatchLocalLlmComplete(callbackId, full) },
                onError = { err -> dispatchLocalLlmError(callbackId, err) }
            )
        }
    }

    private fun dispatchLocalLlmToken(callbackId: String, token: String) {
        runOnUiThread {
            val script = "window.localLlmChat && window.localLlmChat.onToken(${toJsString(callbackId)}, ${toJsString(token)})"
            webView.evaluateJavascript(script, null)
        }
    }

    private fun dispatchLocalLlmComplete(callbackId: String, full: String) {
        runOnUiThread {
            val script = "window.localLlmChat && window.localLlmChat.onComplete(${toJsString(callbackId)}, ${toJsString(full)})"
            webView.evaluateJavascript(script, null)
        }
    }

    private fun dispatchLocalLlmError(callbackId: String, error: String) {
        runOnUiThread {
            val script = "window.localLlmChat && window.localLlmChat.onError(${toJsString(callbackId)}, ${toJsString(error)})"
            webView.evaluateJavascript(script, null)
        }
    }

    private fun toJsString(value: String): String = JSONObject.quote(value)
}

@Composable
fun WebViewScreen(modifier: Modifier = Modifier) {
    val TAG = "FITMIND_DEBUG"
    Log.d(TAG, "🔵 WebViewScreen composable called")

    // Wrap in Surface with explicit white background
    Surface(
        modifier = modifier,
        color = Color.White
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { context ->
            Log.d(TAG, "🟢 WebView factory creating WebView")
            WebView(context).apply {
                Log.d(TAG, "🟡 Configuring WebView settings")

                // Set background to white for debugging (instead of transparent)
                setBackgroundColor(android.graphics.Color.WHITE)

                val assetLoader = WebViewAssetLoader.Builder()
                    .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
                    .build()

                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.setSupportZoom(true)
                settings.allowFileAccess = true
                settings.allowContentAccess = true

                Log.d(TAG, "🟠 JavaScript enabled: ${settings.javaScriptEnabled}")
                Log.d(TAG, "🟠 DOM storage enabled: ${settings.domStorageEnabled}")

                // Enhanced WebChromeClient with console logging
                webChromeClient = object : WebChromeClient() {
                    override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
                        Log.d(TAG, "📱 JS Console [${consoleMessage.messageLevel()}]: ${consoleMessage.message()} (${consoleMessage.sourceId()}:${consoleMessage.lineNumber()})")
                        return true
                    }

                    override fun onProgressChanged(view: WebView?, newProgress: Int) {
                        Log.d(TAG, "⏳ Page loading progress: $newProgress%")
                    }
                }

                webViewClient = object : WebViewClient() {
                    override fun shouldInterceptRequest(
                        view: WebView,
                        request: WebResourceRequest
                    ): WebResourceResponse? {
                        val url = request.url.toString()
                        Log.d(TAG, "🌐 Intercepting request: $url")
                        return assetLoader.shouldInterceptRequest(request.url)
                    }

                    override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                        super.onPageStarted(view, url, favicon)
                        Log.d(TAG, "🚀 Page started loading: $url")
                    }

                    override fun onPageFinished(view: WebView?, url: String?) {
                        super.onPageFinished(view, url)
                        Log.d(TAG, "✅ Page finished loading: $url")
                        // Inject test JavaScript to verify execution
                        view?.evaluateJavascript("console.log('🔥 WEBVIEW TEST: JavaScript is working!'); document.body ? 'BODY EXISTS' : 'NO BODY'") { result ->
                            Log.d(TAG, "🧪 JavaScript test result: $result")
                        }
                    }

                    override fun onReceivedError(
                        view: WebView?,
                        request: WebResourceRequest?,
                        error: WebResourceError?
                    ) {
                        super.onReceivedError(view, request, error)
                        Log.e(TAG, "❌ WebView error: ${error?.errorCode} - ${error?.description} (URL: ${request?.url})")
                    }

                    override fun onReceivedHttpError(
                        view: WebView?,
                        request: WebResourceRequest?,
                        errorResponse: WebResourceResponse?
                    ) {
                        super.onReceivedHttpError(view, request, errorResponse)
                        Log.e(TAG, "❌ HTTP error: ${errorResponse?.statusCode} for ${request?.url}")
                    }
                }

                WebView.setWebContentsDebuggingEnabled(true)
                (context.findActivity() as? MainActivity)?.setupWebView(this)

                val targetUrl = "https://appassets.androidplatform.net/assets/auth.html"
                Log.d(TAG, "🎯 Loading URL: $targetUrl")
                loadUrl(targetUrl)
            }
        },
        update = { webView ->
            Log.d(TAG, "🔄 WebView update called")
        }
        )
    }
}

@Preview(showBackground = true)
@Composable
fun DefaultPreview() {
    MyApplicationTheme {
        WebViewScreen()
    }
}

fun Context.findActivity(): Activity? {
    var context = this
    while (context is ContextWrapper) {
        if (context is Activity) return context
        context = context.baseContext
    }
    return null
}
