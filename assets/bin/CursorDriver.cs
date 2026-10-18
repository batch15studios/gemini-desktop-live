using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace DesktopController
{
    class Program
    {
        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool GetCursorPos(out POINT lpPoint);

        [DllImport("user32.dll")]
        public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

        [DllImport("user32.dll")]
        public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool SetProcessDpiAwarenessContext(IntPtr dpiContext);

        [DllImport("user32.dll")]
        public static extern bool SetProcessDPIAware();

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern int GetWindowTextLength(IntPtr hWnd);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);

        [DllImport("user32.dll")]
        public static extern IntPtr PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

        private const uint WM_CLOSE = 0x0010;
        private const int SW_RESTORE = 9;
        private const int SW_MAXIMIZE = 3;
        private const int SW_MINIMIZE = 6;

        private const byte VK_VOLUME_MUTE = 0xAD;
        private const byte VK_VOLUME_DOWN = 0xAE;
        private const byte VK_VOLUME_UP = 0xAF;
        private const byte VK_MEDIA_NEXT_TRACK = 0xB0;
        private const byte VK_MEDIA_PREV_TRACK = 0xB1;
        private const byte VK_MEDIA_STOP = 0xB2;
        private const byte VK_MEDIA_PLAY_PAUSE = 0xB3;

        [StructLayout(LayoutKind.Sequential)]
        public struct POINT
        {
            public int X;
            public int Y;
        }

        private const uint MOUSEEVENTF_LEFTDOWN   = 0x0002;
        private const uint MOUSEEVENTF_LEFTUP     = 0x0004;
        private const uint MOUSEEVENTF_RIGHTDOWN  = 0x0008;
        private const uint MOUSEEVENTF_RIGHTUP    = 0x0010;
        private const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        private const uint MOUSEEVENTF_MIDDLEUP   = 0x0040;
        private const uint MOUSEEVENTF_WHEEL      = 0x0800;

        private const uint KEYEVENTF_KEYUP = 0x0002;

        static void EnableDpiAwareness()
        {
            try
            {
                // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4
                SetProcessDpiAwarenessContext((IntPtr)(-4));
            }
            catch
            {
                try { SetProcessDPIAware(); } catch { }
            }
        }

        static void SmoothMove(int targetX, int targetY, int durationMs = 70)
        {
            POINT current;
            GetCursorPos(out current);
            int startX = current.X;
            int startY = current.Y;

            double dist = Math.Sqrt(Math.Pow(targetX - startX, 2) + Math.Pow(targetY - startY, 2));
            if (dist < 5)
            {
                SetCursorPos(targetX, targetY);
                return;
            }

            int steps = Math.Max(5, Math.Min(16, (int)(dist / 35)));
            int stepDelay = Math.Max(3, durationMs / steps);

            for (int i = 1; i <= steps; i++)
            {
                double t = (double)i / steps;
                // Ease-out cubic for smooth visual deceleration
                double ease = 1.0 - Math.Pow(1.0 - t, 3);
                int curX = (int)(startX + (targetX - startX) * ease);
                int curY = (int)(startY + (targetY - startY) * ease);
                SetCursorPos(curX, curY);
                Thread.Sleep(stepDelay);
            }
            SetCursorPos(targetX, targetY);
        }

        static int Main(string[] args)
        {
            EnableDpiAwareness();

            if (args.Length == 0)
            {
                Console.WriteLine("{\"error\": \"No command specified. Usage: CursorDriver <command> [args]\"}");
                return 1;
            }

            string cmd = args[0].ToLower();

            try
            {
                switch (cmd)
                {
                    case "getpos":
                        POINT p;
                        GetCursorPos(out p);
                        Console.WriteLine(string.Format("{{\"x\": {0}, \"y\": {1}}}", p.X, p.Y));
                        return 0;

                    case "getdisplay":
                        var b = Screen.PrimaryScreen.Bounds;
                        var wa = Screen.PrimaryScreen.WorkingArea;
                        Console.WriteLine(string.Format("{{\"width\": {0}, \"height\": {1}, \"workWidth\": {2}, \"workHeight\": {3}}}",
                            b.Width, b.Height, wa.Width, wa.Height));
                        return 0;

                    case "move":
                        if (args.Length < 3) return Error("Move requires x and y arguments");
                        int mx = int.Parse(args[1]);
                        int my = int.Parse(args[2]);
                        SmoothMove(mx, my, 80);
                        Console.WriteLine(string.Format("{{\"success\": true, \"action\": \"move\", \"x\": {0}, \"y\": {1}}}", mx, my));
                        return 0;

                    case "click":
                        if (args.Length < 3) return Error("Click requires x and y arguments");
                        int cx = int.Parse(args[1]);
                        int cy = int.Parse(args[2]);
                        string button = args.Length > 3 ? args[3].ToLower() : "left";
                        bool isDouble = args.Length > 4 && (args[4].ToLower() == "true" || args[4] == "1");

                        SmoothMove(cx, cy, 60);
                        Thread.Sleep(20);

                        PerformClick(button);
                        if (isDouble)
                        {
                            Thread.Sleep(80);
                            PerformClick(button);
                        }

                        Console.WriteLine(string.Format("{{\"success\": true, \"action\": \"click\", \"x\": {0}, \"y\": {1}, \"button\": \"{2}\", \"double\": {3}}}", 
                            cx, cy, button, isDouble ? "true" : "false"));
                        return 0;

                    case "drag":
                        if (args.Length < 5) return Error("Drag requires x1 y1 x2 y2");
                        int x1 = int.Parse(args[1]);
                        int y1 = int.Parse(args[2]);
                        int x2 = int.Parse(args[3]);
                        int y2 = int.Parse(args[4]);
                        int steps = args.Length > 5 ? int.Parse(args[5]) : 20;

                        SetCursorPos(x1, y1);
                        Thread.Sleep(30);
                        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
                        Thread.Sleep(30);

                        for (int i = 1; i <= steps; i++)
                        {
                            int curX = x1 + (x2 - x1) * i / steps;
                            int curY = y1 + (y2 - y1) * i / steps;
                            SetCursorPos(curX, curY);
                            Thread.Sleep(8);
                        }

                        Thread.Sleep(30);
                        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
                        Console.WriteLine(string.Format("{{\"success\": true, \"action\": \"drag\", \"startX\": {0}, \"startY\": {1}, \"endX\": {2}, \"endY\": {3}}}",
                            x1, y1, x2, y2));
                        return 0;

                    case "scroll":
                        if (args.Length < 2) return Error("Scroll requires delta argument (positive=up, negative=down)");
                        int delta = int.Parse(args[1]);
                        mouse_event(MOUSEEVENTF_WHEEL, 0, 0, (uint)delta, UIntPtr.Zero);
                        Console.WriteLine(string.Format("{{\"success\": true, \"action\": \"scroll\", \"delta\": {0}}}", delta));
                        return 0;

                    case "type":
                        if (args.Length < 2) return Error("Type requires text argument");
                        string text = args[1];
                        bool pressEnter = args.Length > 2 && (args[2].ToLower() == "true" || args[2] == "1");

                        SendKeys.SendWait(EscapeSendKeys(text));
                        if (pressEnter)
                        {
                            Thread.Sleep(30);
                            SendKeys.SendWait("{ENTER}");
                        }

                        Console.WriteLine("{\"success\": true, \"action\": \"type\"}");
                        return 0;

                    case "hotkey":
                        if (args.Length < 2) return Error("Hotkey requires combo (e.g. ctrl+s, alt+tab, win+d, enter)");
                        string combo = args[1].ToLower().Trim();
                        ExecuteHotkey(combo);
                        Console.WriteLine(string.Format("{{\"success\": true, \"action\": \"hotkey\", \"combo\": \"{0}\"}}", combo));
                        return 0;

                    case "listwindows":
                        var windows = GetOpenWindows();
                        var sbJson = new System.Text.StringBuilder();
                        sbJson.Append("{\"success\":true,\"windows\":[");
                        for (int i = 0; i < windows.Count; i++)
                        {
                            var w = windows[i];
                            if (i > 0) sbJson.Append(",");
                            sbJson.Append(string.Format("{{\"hwnd\":\"{0}\",\"pid\":{1},\"title\":\"{2}\",\"process\":\"{3}\"}}",
                                w.Hwnd.ToInt64(), w.Pid, EscapeJson(w.Title), EscapeJson(w.ProcessName)));
                        }
                        sbJson.Append("]}");
                        Console.WriteLine(sbJson.ToString());
                        return 0;

                    case "focuswindow":
                        if (args.Length < 2) return Error("Focus requires title or process query");
                        string fQuery = args[1].ToLower();
                        var fTarget = FindWindowMatch(fQuery);
                        if (fTarget == null) return Error("Window not found matching: " + args[1]);
                        ShowWindowAsync(fTarget.Hwnd, SW_RESTORE);
                        SetForegroundWindow(fTarget.Hwnd);
                        Console.WriteLine(string.Format("{{\"success\":true,\"action\":\"focus\",\"title\":\"{0}\",\"pid\":{1}}}",
                            EscapeJson(fTarget.Title), fTarget.Pid));
                        return 0;

                    case "snapwindow":
                        if (args.Length < 3) return Error("Snap requires <query> <position: left, right, top, bottom, maximize, minimize, restore, center>");
                        string sQuery = args[1].ToLower();
                        string pos = args[2].ToLower();
                        var sTarget = FindWindowMatch(sQuery);
                        if (sTarget == null) return Error("Window not found matching: " + args[1]);

                        var area = Screen.PrimaryScreen.WorkingArea;
                        if (pos == "maximize" || pos == "max")
                        {
                            ShowWindowAsync(sTarget.Hwnd, SW_MAXIMIZE);
                        }
                        else if (pos == "minimize" || pos == "min")
                        {
                            ShowWindowAsync(sTarget.Hwnd, SW_MINIMIZE);
                        }
                        else if (pos == "left")
                        {
                            ShowWindowAsync(sTarget.Hwnd, SW_RESTORE);
                            MoveWindow(sTarget.Hwnd, area.Left, area.Top, area.Width / 2, area.Height, true);
                        }
                        else if (pos == "right")
                        {
                            ShowWindowAsync(sTarget.Hwnd, SW_RESTORE);
                            MoveWindow(sTarget.Hwnd, area.Left + area.Width / 2, area.Top, area.Width / 2, area.Height, true);
                        }
                        else if (pos == "top")
                        {
                            ShowWindowAsync(sTarget.Hwnd, SW_RESTORE);
                            MoveWindow(sTarget.Hwnd, area.Left, area.Top, area.Width, area.Height / 2, true);
                        }
                        else if (pos == "bottom")
                        {
                            ShowWindowAsync(sTarget.Hwnd, SW_RESTORE);
                            MoveWindow(sTarget.Hwnd, area.Left, area.Top + area.Height / 2, area.Width, area.Height / 2, true);
                        }
                        else if (pos == "center" || pos == "restore")
                        {
                            ShowWindowAsync(sTarget.Hwnd, SW_RESTORE);
                            int cw = (int)(area.Width * 0.8);
                            int ch = (int)(area.Height * 0.8);
                            int snapX = area.Left + (area.Width - cw) / 2;
                            int snapY = area.Top + (area.Height - ch) / 2;
                            MoveWindow(sTarget.Hwnd, snapX, snapY, cw, ch, true);
                        }
                        SetForegroundWindow(sTarget.Hwnd);
                        Console.WriteLine(string.Format("{{\"success\":true,\"action\":\"snap\",\"position\":\"{0}\",\"title\":\"{1}\"}}",
                            pos, EscapeJson(sTarget.Title)));
                        return 0;

                    case "closewindow":
                        if (args.Length < 2) return Error("Close requires title or process query");
                        string cQuery = args[1].ToLower();
                        var cTarget = FindWindowMatch(cQuery);
                        if (cTarget == null) return Error("Window not found matching: " + args[1]);
                        PostMessage(cTarget.Hwnd, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
                        Console.WriteLine(string.Format("{{\"success\":true,\"action\":\"close\",\"title\":\"{0}\"}}",
                            EscapeJson(cTarget.Title)));
                        return 0;

                    case "media":
                        if (args.Length < 2) return Error("Media requires action: mute, volup, voldown, playpause, next, prev");
                        string mAction = args[1].ToLower();
                        byte mVk = 0;
                        if (mAction == "mute") mVk = VK_VOLUME_MUTE;
                        else if (mAction == "volup" || mAction == "volume_up") mVk = VK_VOLUME_UP;
                        else if (mAction == "voldown" || mAction == "volume_down") mVk = VK_VOLUME_DOWN;
                        else if (mAction == "playpause" || mAction == "play_pause" || mAction == "play" || mAction == "pause") mVk = VK_MEDIA_PLAY_PAUSE;
                        else if (mAction == "next" || mAction == "next_track") mVk = VK_MEDIA_NEXT_TRACK;
                        else if (mAction == "prev" || mAction == "prev_track") mVk = VK_MEDIA_PREV_TRACK;
                        else return Error("Unknown media action: " + mAction);

                        int mTimes = 1;
                        int parsedTimes;
                        if (args.Length > 2 && int.TryParse(args[2], out parsedTimes))
                        {
                            mTimes = Math.Max(1, Math.Min(parsedTimes, 50));
                        }
                        for (int i = 0; i < mTimes; i++)
                        {
                            keybd_event(mVk, 0, 0, UIntPtr.Zero);
                            Thread.Sleep(15);
                            keybd_event(mVk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                            Thread.Sleep(15);
                        }
                        Console.WriteLine(string.Format("{{\"success\":true,\"action\":\"media\",\"command\":\"{0}\",\"times\":{1}}}", mAction, mTimes));
                        return 0;

                    default:
                        return Error("Unknown command: " + cmd);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(string.Format("{{\"error\": \"{0}\"}}", ex.Message.Replace("\"", "\\\"")));
                return 1;
            }
        }

        static void PerformClick(string button)
        {
            if (button == "right")
            {
                mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, UIntPtr.Zero);
                Thread.Sleep(25);
                mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, UIntPtr.Zero);
            }
            else if (button == "middle")
            {
                mouse_event(MOUSEEVENTF_MIDDLEDOWN, 0, 0, 0, UIntPtr.Zero);
                Thread.Sleep(25);
                mouse_event(MOUSEEVENTF_MIDDLEUP, 0, 0, 0, UIntPtr.Zero);
            }
            else
            {
                mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
                Thread.Sleep(25);
                mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
            }
        }

        static string EscapeSendKeys(string input)
        {
            // Characters with special meanings in SendKeys: + ^ % ~ ( ) { } [ ]
            var sb = new System.Text.StringBuilder();
            foreach (char c in input)
            {
                if ("+^%~(){}[]".IndexOf(c) >= 0)
                {
                    sb.Append("{" + c + "}");
                }
                else
                {
                    sb.Append(c);
                }
            }
            return sb.ToString();
        }

        static void ExecuteHotkey(string combo)
        {
            // Handle common shortcuts cleanly
            string[] parts = combo.Split(new char[] { '+', '-' }, StringSplitOptions.RemoveEmptyEntries);
            bool ctrl = false, alt = false, shift = false, win = false;
            string key = "";

            foreach (string p in parts)
            {
                string clean = p.Trim();
                if (clean == "ctrl" || clean == "control") ctrl = true;
                else if (clean == "alt") alt = true;
                else if (clean == "shift") shift = true;
                else if (clean == "win" || clean == "windows" || clean == "cmd") win = true;
                else key = clean;
            }

            // Virtual-Key codes
            const byte VK_LWIN = 0x5B;
            const byte VK_CONTROL = 0x11;
            const byte VK_MENU = 0x12; // ALT
            const byte VK_SHIFT = 0x10;

            if (win) keybd_event(VK_LWIN, 0, 0, UIntPtr.Zero);
            if (ctrl) keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
            if (alt) keybd_event(VK_MENU, 0, 0, UIntPtr.Zero);
            if (shift) keybd_event(VK_SHIFT, 0, 0, UIntPtr.Zero);

            Thread.Sleep(20);

            if (!string.IsNullOrEmpty(key))
            {
                if (key == "enter" || key == "return") SendKeys.SendWait("{ENTER}");
                else if (key == "esc" || key == "escape") SendKeys.SendWait("{ESC}");
                else if (key == "tab") SendKeys.SendWait("{TAB}");
                else if (key == "space") SendKeys.SendWait(" ");
                else if (key == "backspace") SendKeys.SendWait("{BACKSPACE}");
                else if (key == "delete") SendKeys.SendWait("{DELETE}");
                else if (key == "up") SendKeys.SendWait("{UP}");
                else if (key == "down") SendKeys.SendWait("{DOWN}");
                else if (key == "left") SendKeys.SendWait("{LEFT}");
                else if (key == "right") SendKeys.SendWait("{RIGHT}");
                else SendKeys.SendWait(EscapeSendKeys(key));
            }

            Thread.Sleep(20);

            if (shift) keybd_event(VK_SHIFT, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            if (alt) keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            if (ctrl) keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            if (win) keybd_event(VK_LWIN, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        }

        public class WindowInfo
        {
            public IntPtr Hwnd;
            public uint Pid;
            public string Title;
            public string ProcessName;
        }

        static System.Collections.Generic.List<WindowInfo> GetOpenWindows()
        {
            var list = new System.Collections.Generic.List<WindowInfo>();
            EnumWindows((hWnd, lParam) =>
            {
                if (!IsWindowVisible(hWnd)) return true;
                var sb = new System.Text.StringBuilder(512);
                int count = GetWindowText(hWnd, sb, 512);
                if (count <= 0) return true;

                string title = sb.ToString().Trim();
                if (string.IsNullOrEmpty(title) || title == "Program Manager") return true;

                uint pid;
                GetWindowThreadProcessId(hWnd, out pid);
                string procName = "";
                try
                {
                    var proc = System.Diagnostics.Process.GetProcessById((int)pid);
                    procName = proc.ProcessName;
                }
                catch { }

                list.Add(new WindowInfo { Hwnd = hWnd, Pid = pid, Title = title, ProcessName = procName });
                return true;
            }, IntPtr.Zero);
            return list;
        }

        static WindowInfo FindWindowMatch(string query)
        {
            var windows = GetOpenWindows();
            string q = query.ToLower();
            foreach (var w in windows)
            {
                if (w.Title.ToLower().Contains(q) || w.ProcessName.ToLower().Contains(q))
                {
                    return w;
                }
            }
            return null;
        }

        static string EscapeJson(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", " ");
        }

        static int Error(string msg)
        {
            Console.WriteLine(string.Format("{{\"error\": \"{0}\"}}", msg));
            return 1;
        }
    }
}
