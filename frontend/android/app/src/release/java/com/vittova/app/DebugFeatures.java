package com.vittova.app;

/**
 * Release builds: no extra notification sources and no pipeline logging. Only
 * the allowlist in {@link PaymentSources} is ever read. (The debug build's copy
 * of this class turns on both for device tests.)
 */
final class DebugFeatures {

    static final String[][] EXTRA_SOURCES = {};

    static final boolean PIPELINE_LOG = false;

    private DebugFeatures() { }
}
