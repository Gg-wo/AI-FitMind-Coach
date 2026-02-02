package com.example.myapplication
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.viewinterop.AndroidView
import com.example.myapplication.ui.theme.MyApplicationTheme
import android.webkit.WebChromeClient
import androidx.webkit.WebViewAssetLoader
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MyApplicationTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
// Load the WebViewScreen with DOM storage enabled.
                    WebViewScreen(modifier = Modifier.padding(innerPadding))
                }
            }
        }
    }
}
@Composable
fun WebViewScreen(modifier: Modifier = Modifier) {
    AndroidView(
        modifier = modifier,
        factory = { context ->
            WebView(context).apply {
                val assetLoader = WebViewAssetLoader.Builder()
                    .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
                    .build()

                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true

                // Allow zooming if needed
                settings.setSupportZoom(true)

                // CRITICAL: This allows alert() dialogs to work (used in stopWorkout)
                webChromeClient = WebChromeClient()

                webViewClient = object : WebViewClient() {
                    override fun shouldInterceptRequest(
                        view: WebView,
                        request: WebResourceRequest
                    ) = assetLoader.shouldInterceptRequest(request.url)
                }

                // Enable debugging so you can inspect via Chrome on your PC
                // (Open chrome://inspect in your desktop browser while app runs)
                WebView.setWebContentsDebuggingEnabled(true)

                loadUrl("https://appassets.androidplatform.net/assets/index.html")
            }
        }
    )
}

@Preview(showBackground = true)
@Composable
fun DefaultPreview() {
    MyApplicationTheme {
        WebViewScreen()
    }
}