package com.vittova.app;

import android.app.Activity;
import android.graphics.Rect;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.DisplayMetrics;
import android.view.View;
import android.view.animation.DecelerateInterpolator;

import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * LaunchScreen — a seamless hand-off from Android's launch screen to the app.
 *
 * Android shows the launch screen (res/drawable/splash_mark.xml on
 * splash_background) the moment Vittova is tapped. Left alone, Capacitor lets
 * it go at the activity's first frame: an empty WebView, before the web app
 * has drawn anything. Instead it is held until the web splash has painted the
 * identical frame underneath (same colour, same mark, same size, same place),
 * then faded out, so the logo never blinks, jumps or changes shade.
 *
 *   install(splash)   MainActivity, before super.onCreate
 *   geometry()        -> { screenHeightDp, webViewTopDp, density }
 *                        where the WebView sits on the screen, so the web splash
 *                        can centre its mark where Android centred the icon
 *   ready()           the web splash has painted: release the launch screen.
 *                        The call resolves only when Android's screen has
 *                        finished fading out and is gone, so the web splash
 *                        starts its animation where the person can see it. (It
 *                        used to resolve at once; on a slow start Android took
 *                        over a second to let go, and the whole animation
 *                        played underneath, unseen.)
 *
 * If the web app never calls ready() (a load failure), the launch screen is
 * released after MAX_HOLD_MS anyway.
 */
@CapacitorPlugin(name = "LaunchScreen")
public class LaunchScreenPlugin extends Plugin {

    static final long MAX_HOLD_MS = 6000L;
    private static final long EXIT_FADE_MS = 220L;

    /** ready() is answered by now even if Android never reports the exit. */
    private static final long GONE_WAIT_MS = 2500L;

    private static volatile boolean webReady;
    private static volatile boolean gone;
    private static volatile PluginCall waitingForGone;
    private static volatile long startedAt;
    private static volatile Activity activity;

    /** Hold the launch screen until ready() (or MAX_HOLD_MS), then fade it out. */
    static void install(Activity host, SplashScreen splash) {
        activity = host;
        webReady = false;
        gone = false;
        waitingForGone = null;
        startedAt = SystemClock.uptimeMillis();

        splash.setKeepOnScreenCondition(() -> !webReady && SystemClock.uptimeMillis() - startedAt < MAX_HOLD_MS);

        splash.setOnExitAnimationListener(provider -> {
            View view = provider.getView();
            view.animate()
                .alpha(0f)
                .setDuration(EXIT_FADE_MS)
                .setInterpolator(new DecelerateInterpolator())
                .withEndAction(() -> {
                    provider.remove();
                    launchScreenGone();
                })
                .start();
        });

        // The condition is only re-checked when the window draws: make sure it
        // does once the time limit passes, even if nothing else changes.
        new Handler(Looper.getMainLooper()).postDelayed(LaunchScreenPlugin::redraw, MAX_HOLD_MS + 16);
    }

    private static void redraw() {
        Activity a = activity;
        if (a == null) return;
        a.runOnUiThread(() -> {
            View content = a.findViewById(android.R.id.content);
            if (content != null) content.invalidate();
        });
    }

    /** Android's launch screen has finished fading out: answer the waiting ready(). */
    private static void launchScreenGone() {
        gone = true;
        PluginCall call = waitingForGone;
        waitingForGone = null;
        if (call != null) call.resolve();
    }

    @PluginMethod
    public void ready(PluginCall call) {
        webReady = true;
        redraw();
        if (gone) {
            call.resolve();
            return;
        }
        waitingForGone = call;
        // Never leave the web splash waiting: if the exit is not reported, go on.
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (waitingForGone == call) launchScreenGone();
        }, GONE_WAIT_MS);
    }

    /**
     * Android centres the launch icon in the app's window (the whole screen,
     * unless in split screen). Reports that window and the WebView's top edge,
     * in dp, on the same screen coordinates.
     */
    @PluginMethod
    @SuppressWarnings("deprecation")
    public void geometry(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject result = new JSObject();
            try {
                Activity a = getActivity();
                float density = a.getResources().getDisplayMetrics().density;
                if (!(density > 0)) density = 1f;
                int windowTop;
                int windowHeight;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    Rect bounds = a.getWindowManager().getCurrentWindowMetrics().getBounds();
                    windowTop = bounds.top;
                    windowHeight = bounds.height();
                } else {
                    DisplayMetrics real = new DisplayMetrics();
                    a.getWindowManager().getDefaultDisplay().getRealMetrics(real);
                    windowTop = 0;
                    windowHeight = real.heightPixels;
                }
                int[] at = new int[2];
                getBridge().getWebView().getLocationOnScreen(at);
                result.put("density", density);
                result.put("windowTopDp", windowTop / density);
                result.put("screenHeightDp", windowHeight / density);
                result.put("webViewTopDp", at[1] / density);
            } catch (Exception e) {
                // Without geometry the web splash centres in the WebView (a few dp off at most).
            }
            call.resolve(result);
        });
    }
}
