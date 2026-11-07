import MarkdownUI
import SwiftUI
import YunCore

public struct PersonaContentView: View {
    private let markdown: String
    @State private var mode = Mode.preview
    @Environment(\.yunStrings) private var text

    private enum Mode { case preview, source }

    public init(markdown: String) {
        self.markdown = markdown
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Picker(text["persona.content"], selection: $mode) {
                Text(text["persona.content.preview"]).tag(Mode.preview)
                Text(text["persona.content.source"]).tag(Mode.source)
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("personaContentMode")

            switch mode {
            case .preview:
                Markdown(markdown)
                    .markdownBlockStyle(\.blockquote) { configuration in
                        HStack(alignment: .top, spacing: 12) {
                            RoundedRectangle(cornerRadius: 2).fill(.quaternary).frame(width: 3)
                            configuration.label.foregroundStyle(.secondary)
                        }
                        .fixedSize(horizontal: false, vertical: true)
                        .markdownMargin(top: .zero, bottom: .em(1))
                    }
                    .markdownBlockStyle(\.codeBlock) { configuration in
                        ScrollView(.horizontal) {
                            configuration.label
                                .fixedSize(horizontal: true, vertical: false)
                                .markdownTextStyle {
                                    FontFamilyVariant(.monospaced)
                                    FontSize(.em(0.9))
                                }
                                .padding(12)
                        }
                        .background(.quaternary, in: RoundedRectangle(cornerRadius: 8))
                        .markdownMargin(top: .zero, bottom: .em(1))
                    }
                    .markdownBlockStyle(\.table) { configuration in
                        ScrollView(.horizontal) {
                            configuration.label.fixedSize(horizontal: true, vertical: false)
                        }
                        .markdownMargin(top: .zero, bottom: .em(1))
                    }
                    .markdownTheme(.basic)
                    // Override both providers: MarkdownUI otherwise fetches block and inline images.
                    .markdownImageProvider(OfflinePersonaImages())
                    .markdownInlineImageProvider(OfflinePersonaImages())
                    .environment(\.openURL, OpenURLAction { _ in .discarded })
                    .textSelection(.enabled)
                    .accessibilityIdentifier("personaMarkdownPreview")
            case .source:
                Text(verbatim: markdown)
                    .font(.system(.callout, design: .monospaced))
                    .textSelection(.enabled)
                    .accessibilityIdentifier("personaMarkdownSource")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// Imported cards remain passive content, including file and custom-scheme image URLs.
private struct OfflinePersonaImages: ImageProvider, InlineImageProvider {
    func makeImage(url: URL?) -> some View {
        Image(systemName: "photo")
            .foregroundStyle(.secondary)
    }

    func image(with url: URL, label: String) async throws -> Image {
        Image(systemName: "photo")
    }
}

#Preview {
    List {
        Section("人物设定") {
            PersonaContentView(markdown: """
                # 小云

                你是 **小云**，喜欢写代码的虚拟角色。

                ## 说话方式

                - 使用中文短句
                - 保持 *认真* 和友善

                > 先理解问题，再给出建议。

                ```text
                你好，我是小云。
                ```
                """)
        }
    }
}
