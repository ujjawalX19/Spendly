package com.vittova.app;

import android.os.Bundle;

import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Before super.onCreate: keep Android's launch screen until the web
        // splash has painted the same frame, then fade it out (LaunchScreenPlugin).
        LaunchScreenPlugin.install(this, SplashScreen.installSplashScreen(this));

        // Register plugins BEFORE super.onCreate()
        registerPlugin(UpiNotificationPlugin.class);
        registerPlugin(PlayBillingPlugin.class);
        registerPlugin(AuthLogPlugin.class);
        registerPlugin(DebitRemindersPlugin.class);
        registerPlugin(LaunchScreenPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
