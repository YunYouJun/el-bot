import Testing
@testable import YunUI

@Suite("Chat Markdown")
struct MarkdownSupportTests {
    @Test("Block Markdown uses the rich renderer")
    func detectsBlockMarkdown() {
        #expect(ChatMarkdownSupport.needsBlockRendering("```swift\nlet value = 1\n```"))
        #expect(ChatMarkdownSupport.needsBlockRendering("- one\n- two"))
        #expect(ChatMarkdownSupport.needsBlockRendering("1. first\n2. second"))
        #expect(ChatMarkdownSupport.needsBlockRendering("| A | B |\n| --- | --- |\n| 1 | 2 |"))
        #expect(ChatMarkdownSupport.needsBlockRendering("A | B\n--- | ---\n1 | 2"))
        #expect(ChatMarkdownSupport.needsBlockRendering("> quoted"))
        #expect(ChatMarkdownSupport.needsBlockRendering("# Heading"))
        #expect(ChatMarkdownSupport.needsBlockRendering("Heading\n==="))
        #expect(ChatMarkdownSupport.needsBlockRendering("![alt](https://example.com/image.png)"))
    }

    @Test("Inline Markdown keeps the lightweight renderer")
    func keepsInlineMarkdownInline() {
        #expect(!ChatMarkdownSupport.needsBlockRendering("Hello **world** and `code`"))
        #expect(!ChatMarkdownSupport.needsBlockRendering("first line\nsecond line"))
    }
}
