"""从 adb / emulator 的文本输出里挑出要用的 Android 目标。

用法::

    adb devices -l | python3 tool/android_target.py device      # 第一个在线设备
    emulator -list-avds | python3 tool/android_target.py avd    # 第一个 AVD
    python3 tool/android_target.py --selftest                  # 内置断言

选不到时输出空行并返回退出码 1，方便 justfile 里用 ``id=$(...)`` 直接判断。
"""

from __future__ import annotations

import sys


def pick_device(text: str) -> str:
    """从 ``adb devices -l`` 输出里取第一个 state=device 的序列号。"""
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith(("List of devices", "*")):
            continue
        parts = line.split()
        # 形如：emulator-5554 device product:sdk_gphone64_x86_64 model:... transport_id:1
        if len(parts) >= 2 and parts[1] == "device":
            return parts[0]
        # 形如：192.168.1.9:5555  device
        if len(parts) >= 2 and ":" in parts[0] and parts[-1] == "device":
            return parts[0]
    return ""


def pick_avd(text: str) -> str:
    """从 ``emulator -list-avds`` 输出里取第一个 AVD 名。"""
    for line in text.splitlines():
        line = line.strip()
        if line and not line.startswith(("INFO", "WARNING", "ERROR")):
            return line
    return ""


def selftest() -> int:
    devices = (
        "List of devices attached\n"
        "emulator-5554          device product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64 "
        "device:emu64xa transport_id:1\n"
        "emulator-5556          offline\n"
        "\n"
    )
    assert pick_device(devices) == "emulator-5554"
    assert pick_device("List of devices attached\n\n") == ""
    assert pick_device("") == ""
    assert pick_device("emulator-5554          offline\n") == ""
    assert pick_device("192.168.1.9:5555\tdevice\n") == "192.168.1.9:5555"

    assert pick_avd("free_clac_api36\n") == "free_clac_api36"
    assert pick_avd("\n  Pixel_8_API_35  \n") == "Pixel_8_API_35"
    assert pick_avd("") == ""
    print("android_target.py: 自检通过")
    return 0


def main(argv: list[str]) -> int:
    if "--selftest" in argv:
        return selftest()
    mode = argv[1] if len(argv) > 1 else "device"
    text = sys.stdin.read()
    pick = pick_device if mode == "device" else pick_avd if mode == "avd" else None
    if pick is None:
        print(f"未知模式：{mode}（可用：device / avd / --selftest）", file=sys.stderr)
        return 2
    target = pick(text)
    print(target)
    return 0 if target else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
