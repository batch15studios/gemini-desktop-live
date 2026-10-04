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

        static int Main(string[] args)
        {
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

                    case "move":
                        if (args.Length < 3) return Error("Move requires x and y arguments");
                        int mx = int.Parse(args[1]);
                        int my = int.Parse(args[2]);
                        SetCursorPos(mx, my);
                        Console.WriteLine(string.Format("{{\"success\": true, \"action\": \"move\", \"x\": {0}, \"y\": {1}}}", mx, my));
                        return 0;

                    case "click":
                        if (args.Length < 3) return Error("Click requires x and y arguments");
                        int cx = int.Parse(args[1]);
                        int cy = int.Parse(args[2]);
                        string button = args.Length > 3 ? args[3].ToLower() : "left";
                        bool isDouble = args.Length > 4 && (args[4].ToLower() == "true" || args[4] == "1");

                        SetCursorPos(cx, cy);
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

        static int Error(string msg)
        {
            Console.WriteLine(string.Format("{{\"error\": \"{0}\"}}", msg));
            return 1;
        }
    }
}
