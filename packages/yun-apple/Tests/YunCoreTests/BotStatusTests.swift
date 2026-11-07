import Foundation
import Testing
@testable import YunCore

@Test func botStatusAcceptsOlderServersWithoutRuntimeInformation() throws {
    let bytes = Data(#"{"name":"Cloud","appId":"123","state":"online","checkedAt":"2026-11-07T00:00:00.000Z"}"#.utf8)
    let status = try MobileJSON.decoder().decode(BotStatus.self, from: bytes)
    #expect(status.state == "online")
    #expect(status.runtime == nil)
    #expect(status.host == nil)
}

@Test func botStatusDecodesRemoteProcessResourcesIndependentlyOfQQConnection() throws {
    let bytes = Data(#"{"name":"Cloud","appId":"123","state":"unknown","checkedAt":"2026-11-07T00:00:00.000Z","runtime":{"hostname":"bot-container","platform":"linux","release":"6.8.0","arch":"arm64","nodeVersion":"v24.11.0","cpuCount":2,"uptimeSeconds":86400,"memoryRSSBytes":268435456}}"#.utf8)
    let status = try MobileJSON.decoder().decode(BotStatus.self, from: bytes)
    #expect(status.state == "unknown")
    #expect(status.runtime?.hostname == "bot-container")
    #expect(status.runtime?.uptimeSeconds == 86400)
    #expect(status.runtime?.memoryRSSBytes == 268435456)
    #expect(status.host == nil)
}

@Test func botStatusDecodesHostMetricsWithoutConfusingThemWithContainerResources() throws {
    let bytes = Data(#"{"name":"Cloud","appId":"123","state":"online","checkedAt":"2026-11-07T00:00:00.000Z","host":{"sampledAt":"2026-11-07T00:00:00.000Z","stale":true,"hostname":"physical-host","cpu":{"count":2,"usagePercent":12.5,"sampleSeconds":1},"memory":{"totalBytes":4294967296,"usedBytes":1073741824,"availableBytes":3221225472,"usagePercent":25},"disks":[{"mountPoint":"/","totalBytes":64424509440,"usedBytes":21474836480,"availableBytes":40000000000,"usagePercent":34.9}]}}"#.utf8)
    let status = try MobileJSON.decoder().decode(BotStatus.self, from: bytes)
    #expect(status.runtime == nil)
    #expect(status.host?.hostname == "physical-host")
    #expect(status.host?.stale == true)
    #expect(status.host?.cpu.usagePercent == 12.5)
    #expect(status.host?.memory.totalBytes == 4294967296)
    #expect(status.host?.disks.first?.mountPoint == "/")
    #expect(status.host?.disks.first?.usedBytes == 21474836480)
}
