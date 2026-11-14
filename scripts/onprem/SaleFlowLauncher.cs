using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;

[assembly: AssemblyTitle("SaleFlow ERP")]
[assembly: AssemblyDescription("SaleFlow ERP Windows Application Launcher")]
[assembly: AssemblyConfiguration("")]
[assembly: AssemblyCompany("SaleFlow Systems")]
[assembly: AssemblyProduct("SaleFlow ERP")]
[assembly: AssemblyCopyright("Copyright © 2026 SaleFlow Systems")]
[assembly: AssemblyTrademark("")]
[assembly: AssemblyCulture("")]
[assembly: ComVisible(false)]
[assembly: AssemblyVersion("1.1.0.0")]
[assembly: AssemblyFileVersion("1.1.0.0")]

namespace SaleFlow.Launcher
{
    static class Program
    {
        [STAThread]
        static int Main(string[] args)
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;

                // 1. Locate bundled Node.js runtime (prefer runtime\node.exe, fallback to system PATH)
                string runtimeNode = Path.Combine(baseDir, "runtime", "node.exe");
                string nodeExe = File.Exists(runtimeNode) ? runtimeNode : "node.exe";

                // 2. Locate process controller
                string scriptPath = Path.Combine(baseDir, "scripts", "process-controller.js");
                if (!File.Exists(scriptPath))
                {
                    MessageBox.Show(
                        "SaleFlow application controller not found at:\n" + scriptPath + "\n\nPlease reinstall SaleFlow ERP.",
                        "SaleFlow ERP",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return 1;
                }

                // 3. Assemble arguments: default to 'launch' if no arguments provided
                string action = (args != null && args.Length > 0) ? string.Join(" ", args) : "launch";
                string arguments = string.Format("\"{0}\" {1}", scriptPath, action);

                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = nodeExe;
                psi.Arguments = arguments;
                psi.WorkingDirectory = baseDir;
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                psi.WindowStyle = ProcessWindowStyle.Hidden;

                using (Process proc = Process.Start(psi))
                {
                    if (proc != null)
                    {
                        // Wait up to 35 seconds for launch completion (server boot & browser opening)
                        proc.WaitForExit(35000);
                        return proc.HasExited ? proc.ExitCode : 0;
                    }
                }
                return 0;
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "An error occurred while launching SaleFlow ERP:\n\n" + ex.Message + "\n\nPlease check the logs in the logs\\ folder.",
                    "SaleFlow ERP Launch Error",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                return 1;
            }
        }
    }
}
