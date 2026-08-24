package com.baze.pos;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        // Register custom Capacitor plugins ก่อน super.onCreate
        registerPlugin(BluetoothPermissionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
