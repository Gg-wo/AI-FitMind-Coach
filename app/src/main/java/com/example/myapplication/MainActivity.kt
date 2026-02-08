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

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.d("FITMIND_DEBUG", "🏁 MainActivity onCreate called")
        
        setContent {
            // FORCE light theme and disable dynamic color to prevent dark overlay
            MyApplicationTheme(
                darkTheme = false,
                dynamicColor = false
            ) {
                WebViewScreen(modifier = Modifier.fillMaxSize())
            }
        }
    }
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
