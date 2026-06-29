/*
 * LegacyDataBridgePlugin.kt
 *
 * Reads the legacy Expo / React Native AsyncStorage SQLite database and
 * returns it to JS as a single JSON blob.
 *
 * Install:
 *   1. Drop this file into:
 *        android/app/src/main/java/com/coldstoragecoins/LegacyDataBridgePlugin.kt
 *      (adjust the package line if your applicationId differs.)
 *   2. Register the plugin in MainActivity.java/kt:
 *
 *        // MainActivity.java
 *        import com.coldstoragecoins.LegacyDataBridgePlugin;
 *        public class MainActivity extends BridgeActivity {
 *          @Override public void onCreate(Bundle savedInstanceState) {
 *            registerPlugin(LegacyDataBridgePlugin.class);
 *            super.onCreate(savedInstanceState);
 *          }
 *        }
 *
 *   3. Rebuild. The JS side calls it via:
 *        const Bridge = registerPlugin<{read:()=>Promise<{data:string|null}>}>("LegacyDataBridge");
 *        const { data } = await Bridge.read();
 *
 * RN AsyncStorage on Android persists to a SQLite DB named `RKStorage` with
 * one table `catalystLocalStorage(key TEXT PRIMARY KEY, value TEXT)`.
 * We open it read-only, dump every row, JSON-parse where possible, and
 * return the whole map.
 */

package com.coldstoragecoins

import android.database.sqlite.SQLiteDatabase
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONException
import org.json.JSONObject
import org.json.JSONArray
import java.io.File

@CapacitorPlugin(name = "LegacyDataBridge")
class LegacyDataBridgePlugin : Plugin() {

    @PluginMethod
    fun read(call: PluginCall) {
        try {
            val ctx = context ?: run { call.resolve(JSObject().put("data", null as String?)); return }
            val dbFile: File = ctx.getDatabasePath("RKStorage")
            if (!dbFile.exists()) {
                call.resolve(JSObject().put("data", null as String?))
                return
            }
            val out = JSONObject()
            val db = SQLiteDatabase.openDatabase(dbFile.absolutePath, null, SQLiteDatabase.OPEN_READONLY)
            db.use { d ->
                val cursor = d.rawQuery("SELECT key, value FROM catalystLocalStorage", null)
                cursor.use { c ->
                    while (c.moveToNext()) {
                        val key = c.getString(0) ?: continue
                        val raw = c.getString(1) ?: continue
                        val parsed: Any = try {
                            when {
                                raw.startsWith("{") -> JSONObject(raw)
                                raw.startsWith("[") -> JSONArray(raw)
                                else -> raw
                            }
                        } catch (e: JSONException) {
                            raw
                        }
                        out.put(key, parsed)
                    }
                }
            }
            call.resolve(JSObject().put("data", out.toString()))
        } catch (e: Exception) {
            call.reject("Legacy read failed: ${e.message}", e)
        }
    }
}
