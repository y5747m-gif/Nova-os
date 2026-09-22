package os.nova.launcher

import android.app.Activity
import android.appwidget.AppWidgetHostView
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * NOVA's native widget sheet: pick a system widget, configure it, and see it
 * live. Opened from the web layer (`NovaSystem.openWidgets()`); the placed
 * widgets are remembered in [NovaPrefs] and re-rendered on every open.
 */
class NovaWidgetHostActivity : Activity() {

    private lateinit var list: LinearLayout
    private var pendingId: Int = -1

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#CC07080B"))
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        val sheet = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#14161D"))
            setPadding(36, 48, 36, 48)
        }
        val sheetParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM
        )
        root.addView(sheet, sheetParams)

        val title = TextView(this).apply {
            text = getString(R.string.widgets_title)
            textSize = 18f
            setTextColor(Color.WHITE)
        }
        sheet.addView(title)

        val sub = TextView(this).apply {
            text = getString(R.string.widgets_sub)
            textSize = 13f
            setTextColor(Color.parseColor("#8C93A1"))
            setPadding(0, 8, 0, 24)
        }
        sheet.addView(sub)

        val scroll = ScrollView(this)
        list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        scroll.addView(list)
        sheet.addView(
            scroll,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f
            ),
        )

        val add = Button(this).apply {
            text = getString(R.string.widgets_add)
            setOnClickListener { startPick() }
        }
        sheet.addView(add)

        val close = Button(this, null, android.R.attr.borderlessButtonStyle).apply {
            text = getString(R.string.widgets_close)
            setTextColor(Color.parseColor("#8C93A1"))
            setOnClickListener { finish() }
        }
        sheet.addView(close)

        setContentView(root)
        NovaWidgets.startListening(this)
        render()
    }

    override fun onDestroy() {
        // keep listening while NOVA itself is alive — the host is shared
        super.onDestroy()
    }

    private fun render() {
        list.removeAllViews()
        val ids = NovaPrefs.widgets(this)
        if (ids.isEmpty()) {
            list.addView(TextView(this).apply {
                text = getString(R.string.widgets_empty)
                textSize = 14f
                setTextColor(Color.parseColor("#5A6070"))
                setPadding(0, 24, 0, 24)
                gravity = Gravity.CENTER
            })
            return
        }
        val mgr = NovaWidgets.manager(this)
        for (id in ids) {
            try {
                val info = mgr?.getAppWidgetInfo(id)
                if (info == null) {
                    NovaWidgets.deleteId(this, id)
                    continue
                }
                val hostView: AppWidgetHostView =
                    NovaWidgets.host(this).createView(this, id, info)
                val row = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    setPadding(0, 8, 0, 8)
                }
                row.addView(
                    hostView,
                    LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                    ),
                )
                val remove = Button(this, null, android.R.attr.borderlessButtonStyle).apply {
                    text = getString(R.string.widgets_remove, info.loadLabel(packageManager))
                    textSize = 12f
                    setTextColor(Color.parseColor("#FF8A8A"))
                    setOnClickListener {
                        NovaWidgets.deleteId(this@NovaWidgetHostActivity, id)
                        render()
                    }
                }
                row.addView(remove)
                list.addView(row)
            } catch (_: Exception) { }
        }
    }

    private fun startPick() {
        pendingId = NovaWidgets.allocateId(this)
        if (pendingId < 0) return
        if (!NovaWidgets.pick(this, pendingId)) {
            NovaWidgets.deleteId(this, pendingId)
            pendingId = -1
        }
    }

    @Deprecated("launcher widget flow")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        when (requestCode) {
            NovaWidgets.REQ_PICK -> {
                if (resultCode == RESULT_OK && pendingId >= 0) {
                    if (!NovaWidgets.onPicked(this, pendingId, data)) {
                        NovaWidgets.deleteId(this, pendingId)
                    }
                } else if (pendingId >= 0) {
                    NovaWidgets.deleteId(this, pendingId)
                }
                if (resultCode == RESULT_OK) render()
                pendingId = -1
            }
            NovaWidgets.REQ_BIND -> {
                if (resultCode == RESULT_OK && pendingId >= 0) {
                    NovaPrefs.addWidget(this, pendingId)
                    render()
                } else if (pendingId >= 0) {
                    NovaWidgets.deleteId(this, pendingId)
                }
                pendingId = -1
            }
            NovaWidgets.REQ_CONFIGURE -> {
                if (resultCode == RESULT_OK && pendingId >= 0) {
                    NovaPrefs.addWidget(this, pendingId)
                } else if (pendingId >= 0) {
                    NovaWidgets.deleteId(this, pendingId)
                }
                render()
                pendingId = -1
            }
        }
    }
}
