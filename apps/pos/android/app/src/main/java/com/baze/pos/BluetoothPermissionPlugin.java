package com.baze.pos;

import android.Manifest;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * BluetoothPermissionPlugin
 *
 * ทำไมต้องมี plugin นี้แยกจาก capacitor-thermal-printer:
 *   - Android 12+ (API 31+) ต้อง request BLUETOOTH_SCAN และ BLUETOOTH_CONNECT
 *     ที่ RUNTIME — ไม่ใช่แค่ declare ใน Manifest
 *   - ถ้าไม่ request -> scan จะ return 0 devices โดยไม่มี error ชัดเจน
 *   - plugin นี้ expose checkPermissions() และ requestPermissions()
 *     ให้ JavaScript เรียกผ่าน Capacitor bridge (ดู src/lib/bluetooth-permission.ts)
 *
 * เขียนเป็น Java (ไม่ใช่ Kotlin) เพราะ Capacitor app module นี้เป็น Java-only
 * ไม่ได้ apply Kotlin Gradle plugin — MainActivity.java จึงจะ registerPlugin ตัวนี้ได้.
 */
@CapacitorPlugin(
    name = "BluetoothPermission",
    permissions = {
        // Android < 12 (API < 31)
        @Permission(strings = { Manifest.permission.BLUETOOTH },       alias = "bluetooth"),
        @Permission(strings = { Manifest.permission.BLUETOOTH_ADMIN }, alias = "bluetoothAdmin"),

        // Android 12+ (API 31+)
        @Permission(strings = { Manifest.permission.BLUETOOTH_SCAN },    alias = "bluetoothScan"),
        @Permission(strings = { Manifest.permission.BLUETOOTH_CONNECT }, alias = "bluetoothConnect"),

        // จำเป็นสำหรับ BLE scan ทุก Android version
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION },   alias = "fineLocation"),
        @Permission(strings = { Manifest.permission.ACCESS_COARSE_LOCATION }, alias = "coarseLocation"),
    }
)
public class BluetoothPermissionPlugin extends Plugin {

    // ─── checkPermissions ────────────────────────────────────────────────────

    @PluginMethod
    @Override
    public void checkPermissions(PluginCall call) {
        PermissionState bluetooth = getPermissionState("bluetooth");
        PermissionState scan      = getPermissionState("bluetoothScan");
        PermissionState connect   = getPermissionState("bluetoothConnect");
        PermissionState location  = getPermissionState("fineLocation");

        // รวมสถานะ: ถ้าทุกตัวที่จำเป็นเป็น granted = true
        boolean allGranted;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            allGranted = scan == PermissionState.GRANTED
                && connect == PermissionState.GRANTED
                && location == PermissionState.GRANTED;
        } else {
            allGranted = bluetooth == PermissionState.GRANTED
                && location == PermissionState.GRANTED;
        }

        JSObject result = new JSObject();
        result.put("bluetooth",        stateStr(bluetooth));
        result.put("bluetoothScan",    stateStr(scan));
        result.put("bluetoothConnect", stateStr(connect));
        result.put("location",         stateStr(location));
        result.put("allGranted",       allGranted);
        call.resolve(result);
    }

    // ─── requestPermissions ──────────────────────────────────────────────────

    @PluginMethod
    @Override
    public void requestPermissions(PluginCall call) {
        // เลือก permissions ที่จะ request ตาม Android version
        String[] aliases;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            aliases = new String[] { "bluetoothScan", "bluetoothConnect", "fineLocation" };
        } else {
            aliases = new String[] { "bluetooth", "bluetoothAdmin", "fineLocation", "coarseLocation" };
        }
        requestPermissionForAliases(aliases, call, "bluetoothPermissionCallback");
    }

    @PermissionCallback
    private void bluetoothPermissionCallback(PluginCall call) {
        // เรียก checkPermissions หลัง user ตอบ dialog
        checkPermissions(call);
    }

    private String stateStr(PermissionState s) {
        return s == null ? "denied" : s.toString().toLowerCase();
    }
}
