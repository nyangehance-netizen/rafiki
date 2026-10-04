package tz.rafiki.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Rafiki for Android: opens the Rafiki website full screen.
 * The address comes from BuildConfig.APP_URL, set when the APK is built.
 */
public class MainActivity extends Activity {

    private WebView web;
    private String appHost;

    private static final String OFFLINE_PAGE =
        "<!doctype html><html lang='sw'><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
        + "<style>body{margin:0;font-family:sans-serif;background:#f3f5f4;color:#14232a;display:flex;align-items:center;"
        + "justify-content:center;height:100vh;text-align:center;padding:0 24px;box-sizing:border-box}"
        + "h1{font-size:1.5rem;margin:0 0 8px}p{color:#5b6b70;margin:0 0 20px}"
        + "button{font-size:1rem;font-weight:700;background:#0d6e72;color:#fff;border:0;border-radius:14px;padding:12px 24px}"
        + "</style></head><body><div><h1>Hakuna mtandao</h1>"
        + "<p>Rafiki anahitaji intaneti ili kujibu. Angalia data au Wi-Fi yako kisha ujaribu tena.</p>"
        + "<button onclick='Rafiki.retry()'>Jaribu tena</button></div></body></html>";

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        appHost = Uri.parse(BuildConfig.APP_URL).getHost();

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#f3f5f4"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // keeps the chat history on the phone
        s.setDatabaseEnabled(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setUserAgentString(s.getUserAgentString() + " RafikiAndroid/" + BuildConfig.VERSION_NAME);

        web.addJavascriptInterface(new Object() {
            @android.webkit.JavascriptInterface
            public void retry() {
                runOnUiThread(() -> web.loadUrl(BuildConfig.APP_URL));
            }
        }, "Rafiki");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                // Rafiki's own pages stay inside the app; everything else opens in the phone's browser.
                if (appHost != null && appHost.equalsIgnoreCase(uri.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException ignored) { }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    view.loadDataWithBaseURL(null, OFFLINE_PAGE, "text/html", "utf-8", null);
                }
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(BuildConfig.APP_URL);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onPause() { super.onPause(); web.onPause(); }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); }
}
