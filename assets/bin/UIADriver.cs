using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Automation;

namespace UIADriver
{
    class Program
    {
        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

        private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        private const uint MOUSEEVENTF_LEFTUP   = 0x0004;

        static int Main(string[] args)
        {
            if (args.Length == 0)
            {
                Console.WriteLine("{\"error\": \"No command specified. Usage: UIADriver find|click <query>\"}");
                return 1;
            }

            string cmd = args[0].ToLower();
            string query = args.Length > 1 ? args[1] : "";

            try
            {
                if (cmd == "find")
                {
                    var matches = FindElements(query);
                    var sb = new System.Text.StringBuilder();
                    sb.Append("{\"success\":true,\"total\":").Append(matches.Count).Append(",\"elements\":[");
                    for (int i = 0; i < matches.Count; i++)
                    {
                        var m = matches[i];
                        if (i > 0) sb.Append(",");
                        sb.Append(string.Format("{{\"name\":\"{0}\",\"type\":\"{1}\",\"id\":\"{2}\",\"x\":{3},\"y\":{4},\"w\":{5},\"h\":{6}}}",
                            EscapeJson(m.Name), EscapeJson(m.ControlType), EscapeJson(m.AutomationId),
                            (int)m.Rect.X, (int)m.Rect.Y, (int)m.Rect.Width, (int)m.Rect.Height));
                    }
                    sb.Append("]}");
                    Console.WriteLine(sb.ToString());
                    return 0;
                }
                else if (cmd == "click")
                {
                    if (string.IsNullOrEmpty(query))
                    {
                        Console.WriteLine("{\"error\":\"Click requires query name\"}");
                        return 1;
                    }

                    var matches = FindElements(query);
                    if (matches.Count == 0)
                    {
                        Console.WriteLine(string.Format("{{\"error\":\"No UI element found matching: {0}\"}}", EscapeJson(query)));
                        return 1;
                    }

                    var target = matches[0];
                    bool invoked = false;

                    if (target.Element != null)
                    {
                        try
                        {
                            object patternObj;
                            if (target.Element.TryGetCurrentPattern(InvokePattern.Pattern, out patternObj))
                            {
                                var invoke = patternObj as InvokePattern;
                                if (invoke != null)
                                {
                                    invoke.Invoke();
                                    invoked = true;
                                }
                            }
                        }
                        catch { }
                    }

                    if (!invoked && target.Rect.Width > 0 && target.Rect.Height > 0)
                    {
                        int cx = (int)(target.Rect.X + target.Rect.Width / 2);
                        int cy = (int)(target.Rect.Y + target.Rect.Height / 2);
                        SetCursorPos(cx, cy);
                        Thread.Sleep(20);
                        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
                        Thread.Sleep(25);
                        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
                    }

                    Console.WriteLine(string.Format("{{\"success\":true,\"action\":\"click_element\",\"name\":\"{0}\",\"invokedPattern\":{1}}}",
                        EscapeJson(target.Name), invoked ? "true" : "false"));
                    return 0;
                }
                else
                {
                    Console.WriteLine("{\"error\":\"Unknown command: " + cmd + "\"}");
                    return 1;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(string.Format("{{\"error\":\"{0}\"}}", EscapeJson(ex.Message)));
                return 1;
            }
        }

        class MatchItem
        {
            public AutomationElement Element;
            public string Name;
            public string ControlType;
            public string AutomationId;
            public System.Windows.Rect Rect;
        }

        static List<MatchItem> FindElements(string query)
        {
            var results = new List<MatchItem>();
            string q = (query ?? "").ToLower().Trim();

            AutomationElement root = AutomationElement.RootElement;
            if (root == null) return results;

            try
            {
                var focused = AutomationElement.FocusedElement;
                if (focused != null)
                {
                    SearchSubtree(focused, q, results);
                }
            }
            catch { }

            if (results.Count < 5)
            {
                try
                {
                    var topWindows = root.FindAll(TreeScope.Children, Condition.TrueCondition);
                    foreach (AutomationElement win in topWindows)
                    {
                        try
                        {
                            if (win.Current.IsOffscreen) continue;
                            SearchSubtree(win, q, results);
                            if (results.Count >= 20) break;
                        }
                        catch { }
                    }
                }
                catch { }
            }

            return results;
        }

        static void SearchSubtree(AutomationElement rootEl, string q, List<MatchItem> results)
        {
            if (rootEl == null || results.Count >= 20) return;
            try
            {
                var collection = rootEl.FindAll(TreeScope.Descendants, new OrCondition(
                    new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button),
                    new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.MenuItem),
                    new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit),
                    new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.TabItem),
                    new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Hyperlink),
                    new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.CheckBox)
                ));

                foreach (AutomationElement el in collection)
                {
                    try
                    {
                        string name = el.Current.Name ?? "";
                        string autoId = el.Current.AutomationId ?? "";
                        string type = el.Current.ControlType != null ? el.Current.ControlType.ProgrammaticName.Replace("ControlType.", "") : "";

                        bool match = string.IsNullOrEmpty(q) || 
                                     name.ToLower().Contains(q) || 
                                     autoId.ToLower().Contains(q);

                        if (match && (!string.IsNullOrEmpty(name) || !string.IsNullOrEmpty(autoId)))
                        {
                            results.Add(new MatchItem
                            {
                                Element = el,
                                Name = name,
                                ControlType = type,
                                AutomationId = autoId,
                                Rect = el.Current.BoundingRectangle
                            });
                            if (results.Count >= 20) break;
                        }
                    }
                    catch { }
                }
            }
            catch { }
        }

        static string EscapeJson(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", " ");
        }
    }
}
