package com.coldstoragecoins.legacydatabridge

import android.database.sqlite.SQLiteDatabase
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.io.File

@CapacitorPlugin(name = "LegacyDataBridge")
class LegacyDataBridgePlugin : Plugin() {

    // SECURITY (BM-12): keys stripped before crossing the bridge into JS.
    private val secretKeys = setOf(
        "privateKey", "private_key", "wif", "secret", "secretKey",
        "mnemonic", "seed", "seedPhrase", "phrase", "xprv", "xpriv"
    )

    @PluginMethod
    fun read(call: PluginCall) {
        try {
            val ctx = context ?: run {
                call.resolve(JSObject().put("data", null as String?))
                return
            }
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
            sanitize(out)
            call.resolve(JSObject().put("data", out.toString()))
        } catch (e: Exception) {
            call.reject("Legacy read failed: ${e.message}", e)
        }
    }

    private fun sanitize(node: Any?) {
        when (node) {
            is JSONObject -> {
                val keys = node.keys().asSequence().toList()
                for (k in keys) {
                    if (secretKeys.contains(k)) {
                        node.remove(k)
                    } else {
                        sanitize(node.opt(k))
                    }
                }
            }
            is JSONArray -> {
                for (i in 0 until node.length()) sanitize(node.opt(i))
            }
        }
    }
}
