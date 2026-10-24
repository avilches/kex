import json
import os
import tempfile
import unittest

import kexperf

SAMPLE = """Analysis of sampling com.apple.WebKit.WebContent (pid 1) every 1 millisecond
Physical footprint:         900M

Call graph:
    1000 Thread_1   DispatchQueue_1: com.apple.main-thread  (serial)
    + 1000 start  (in dyld) + 1  [0x1]
    + ! 600 mach_msg2_trap  (in libsystem_kernel.dylib) + 8  [0x2]
    + ! 300 WebCore::timerFired(void*)  (in WebCore) + 76  [0x3]
    + ! : 250 WebKit::WebPage::updateRendering()  (in WebKit) + 44  [0x4]
    + ! :   100 WebCore::Document::updateLayout(int)  (in WebCore) + 1  [0x5]
    + ! :   50 WebCore::Style::TreeResolver::resolve()  (in WebCore) + 1  [0x6]
    1000 Thread_2: Heap Helper Thread
    + 1000 __psynch_cvwait  (in libsystem_kernel.dylib) + 8  [0x7]
"""


JIT_STALL_SAMPLE = """Analysis of sampling com.apple.WebKit.WebContent (pid 1) every 1 millisecond
Physical footprint:         500M

Call graph:
    1000 Thread_1   DispatchQueue_1: com.apple.main-thread  (serial)
    + 1000 start  (in dyld) + 1  [0x1]
    +   1000 JSC::Heap::collect(JSC::Synchronousness, JSC::GCRequest)  (in JavaScriptCore) + 108  [0x2]
    +     1000 JSC::JITWorklist::suspendAllThreads()  (in JavaScriptCore) + 336  [0x3]
    +       1000 __psynch_cvwait  (in libsystem_kernel.dylib) + 8  [0x4]
    1000 Thread_2: JIT Worklist Helper Thread
    + 1000 JSC::DFG::performIntegerRangeOptimization(JSC::DFG::Graph&)  (in JavaScriptCore) + 748  [0x5]
"""


def shares(**overrides):
    base = {k: 0.0 for k in kexperf.MAIN_THREAD_KEYS}
    base.update(overrides)
    return base


class MainThreadShares(unittest.TestCase):
    def test_reads_the_main_thread_only(self):
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
            f.write(SAMPLE)
        try:
            result = kexperf.main_thread_shares(f.name)
        finally:
            os.unlink(f.name)
        self.assertEqual(result["samples"], 1000)
        self.assertEqual(result["shares"]["idle"], 60.0)
        self.assertEqual(result["shares"]["rendering"], 25.0)
        self.assertEqual(result["shares"]["layout"], 10.0)
        self.assertEqual(result["shares"]["style"], 5.0)
        self.assertEqual(result["footprint"], "Physical footprint:         900M")

    def test_rejects_a_file_without_a_main_thread(self):
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
            f.write("nothing here\n")
        try:
            with self.assertRaises(SystemExit):
                kexperf.main_thread_shares(f.name)
        finally:
            os.unlink(f.name)


class JitStall(unittest.TestCase):
    def test_a_main_thread_waiting_for_the_jit_is_measured(self):
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
            f.write(JIT_STALL_SAMPLE)
        try:
            result = kexperf.main_thread_shares(f.name)
        finally:
            os.unlink(f.name)
        self.assertEqual(result["shares"]["jit_wait"], 100.0)

    def test_the_jit_wait_beats_the_garbage_collection_it_hides_behind(self):
        text = kexperf.verdict(shares(idle=0, gc=100, jit_wait=100))
        self.assertTrue(text.startswith("stalled"))
        self.assertIn("JIT", text)

    def test_a_short_jit_wait_does_not_change_the_verdict(self):
        self.assertTrue(kexperf.verdict(shares(idle=62, jit_wait=2)).startswith("healthy"))


JIT_LINES = [
    "2026-10-24 17:48:12.427077-0400 0x3 Error 0x0 88204 0 probe: (WebKit) [com.apple.JavaScriptCore:DataLog] WebContent[88255] Optimized probeHotFn#CzipLV:[0x10d1f02c0->0x10d1d5780, LLIntFunctionCall, 38] using Baseline with Baseline into 1168 bytes in 0.094500 ms.",
    "2026-10-24 17:48:12.427503-0400 0x3 Error 0x0 88204 0 probe: (WebKit) [com.apple.JavaScriptCore:DataLog] WebContent[88255] Optimized probeHotFn#CzipLV:[0x10d1f03a0->0x10d1f02c0, NoneFunctionCall, 38] using DFG with DFG into 624 bytes in 0.200375 ms.",
    "2026-10-24 17:48:12.428409-0400 0x3 Error 0x0 88204 0 probe: (WebKit) [com.apple.JavaScriptCore:DataLog] WebContent[88255] Optimized probeHotFn#CzipLV:[0x10d1f0480->0x10d1f02c0, NoneFunctionCall, 38 (DidTryToEnterInLoop)] using FTL with FTL into 716 bytes in 0.798958 ms (DFG: 0.453375, B3: 0.345583).",
    "2026-10-24 17:48:13.000000-0400 0x3 Error 0x0 88204 0 probe: (WebKit) [com.apple.JavaScriptCore:DataLog] WebContent[88255] Optimized <global>#DDZnUs:[0x1->0x2, LLIntGlobal, 70] using DFG with DFG into 1088 bytes in 48213.5 ms.",
    "2026-10-24 17:48:14.000000-0400 0x3 Error 0x0 88204 0 probe: (WebKit) [com.apple.JavaScriptCore:DataLog] WebContent[88255] Optimized #AbCdEf:[0x3->0x4, NoneFunctionCall, 9] using DFG with DFG into 100 bytes in 2.5 ms.",
    "2026-10-24 17:48:15.000000-0400 0x3 Default 0x0 88204 0 probe: unrelated line",
]


class JitCompiles(unittest.TestCase):
    def test_reads_name_tier_and_time_and_ignores_other_lines(self):
        compiles = kexperf.parse_jit_compiles(JIT_LINES)
        self.assertEqual(len(compiles), 5)
        self.assertEqual(compiles[1], {"name": "probeHotFn", "tier": "DFG", "bytes": 624, "ms": 0.200375})

    def test_a_signature_in_brackets_with_extra_text_still_parses(self):
        ftl = kexperf.parse_jit_compiles(JIT_LINES)[2]
        self.assertEqual((ftl["tier"], ftl["ms"]), ("FTL", 0.798958))

    def test_an_anonymous_function_gets_a_placeholder_name(self):
        self.assertEqual(kexperf.parse_jit_compiles(JIT_LINES)[4]["name"], "<anonymous>")

    def test_summary_orders_functions_by_total_time(self):
        rows = kexperf.summarize_jit(kexperf.parse_jit_compiles(JIT_LINES))
        self.assertEqual(rows[0]["name"], "<global>")
        self.assertEqual(rows[0]["max_ms"], 48213.5)
        hot = next(r for r in rows if r["name"] == "probeHotFn")
        self.assertEqual(hot["compiles"], 3)
        self.assertAlmostEqual(hot["total_ms"], 1.093833, places=5)


class Verdict(unittest.TestCase):
    def test_a_sleeping_main_thread_is_healthy(self):
        self.assertTrue(kexperf.verdict(shares(idle=62)).startswith("healthy"))

    def test_little_spare_time_is_busy(self):
        self.assertTrue(kexperf.verdict(shares(idle=30)).startswith("busy"))

    def test_a_saturated_thread_names_its_largest_cost(self):
        text = kexperf.verdict(shares(idle=4, layout=20, style=17))
        self.assertTrue(text.startswith("saturated"))
        self.assertIn("layout (20", text)


class ProfilerReports(unittest.TestCase):
    def write_log(self, lines):
        directory = tempfile.mkdtemp()
        with open(os.path.join(directory, "Kex.log"), "w") as f:
            f.write("\n".join(lines) + "\n")
        return directory

    def line(self, day, clock, message):
        return f"[{day}][{clock}][webview:f@tauri://x:1:2][INFO] {message}"

    def test_keeps_valid_profiler_lines_inside_the_window_in_order(self):
        report = json.dumps({"rafShare": 0.1})
        directory = self.write_log(
            [
                self.line("2026-10-21", "09:00:00", f"[profiler] {report}"),
                self.line("2026-10-21", "08:00:00", f"[profiler] {report}"),
                self.line("2026-10-21", "07:00:00", f"[profiler] {report}"),
                self.line("2026-10-21", "08:30:00", "[profiler] started main"),
                self.line("2026-10-21", "08:31:00", "[profiler] {not json"),
                self.line("2026-10-21", "08:32:00", "something else"),
            ]
        )
        found = kexperf.read_profiler_reports(directory, "2026-10-21 07:30:00")
        self.assertEqual([stamp for stamp, _ in found], ["2026-10-21 08:00:00", "2026-10-21 09:00:00"])

    def test_reads_archived_logs_too(self):
        directory = self.write_log([self.line("2026-10-21", "09:00:00", '[profiler] {"rafShare": 0.1}')])
        with open(os.path.join(directory, "Kex_2026-10-20_10-00-00.log"), "w") as f:
            f.write(self.line("2026-10-20", "10:00:00", '[profiler] {"rafShare": 0.2}') + "\n")
        found = kexperf.read_profiler_reports(directory, "2026-10-01 00:00:00")
        self.assertEqual(len(found), 2)


if __name__ == "__main__":
    unittest.main()
