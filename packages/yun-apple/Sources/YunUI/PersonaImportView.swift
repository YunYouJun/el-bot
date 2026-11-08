import SwiftUI
import UniformTypeIdentifiers
import YunCore

struct PersonaImportView: View {
    let model: PersonaLibraryStore
    let onImported: (String) -> Void
    @Environment(\.yunStrings) private var text
    @Environment(\.dismiss) private var dismiss
    @State private var kind = Kind.file
    @State private var location = ""
    @State private var path = ""
    @State private var gitRef = "HEAD"
    @State private var choosingFile = false
    private enum Kind: String, CaseIterable { case file, url, git }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker(text["persona.importKind"], selection: $kind) {
                        ForEach(Kind.allCases, id: \.self) { item in
                            Text(text["persona.import.\(item.rawValue)"]).tag(item)
                        }
                    }
                    if kind == .file {
                        Button(text["persona.chooseFile"]) { choosingFile = true }
                            .accessibilityIdentifier("personaChooseFile")
                    } else {
                        locationField
                        if kind == .git {
                            gitFields
                        }
                        Button(text["persona.importPreview"]) {
                            let input: PersonaImport = kind == .url
                                ? .link(trim(location))
                                : .git(
                                    repository: trim(location),
                                    path: trim(path),
                                    ref: trim(gitRef).isEmpty ? "HEAD" : trim(gitRef)
                                )
                            Task { await upload(input) }
                        }
                        .disabled(trim(location).isEmpty || (kind == .git && trim(path).isEmpty))
                        .accessibilityIdentifier("personaImportSubmit")
                    }
                } footer: {
                    Text(text["persona.importHint"])
                }
                .disabled(model.busy)
                if model.busy { Section { ProgressView(text["persona.importing"]) } }
                PersonaFeedback(model: model)
            }
            .formStyle(.grouped)
            .navigationTitle(text["persona.import"])
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(text["persona.close"]) { dismiss() }.disabled(model.busy)
                }
            }
            .interactiveDismissDisabled(model.busy)
            .fileImporter(
                isPresented: $choosingFile,
                allowedContentTypes: [UTType(filenameExtension: "md") ?? .plainText, .plainText]
            ) { result in
                do {
                    let url = try result.get()
                    let access = url.startAccessingSecurityScopedResource()
                    defer { if access { url.stopAccessingSecurityScopedResource() } }
                    let handle = try FileHandle(forReadingFrom: url)
                    defer { try? handle.close() }
                    let data = try handle.read(upToCount: 32 * 1024 + 1) ?? Data()
                    let input = try PersonaImport.file(name: url.lastPathComponent, data: data)
                    Task { await upload(input) }
                } catch {
                    model.report(error)
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 520, idealWidth: 560, minHeight: 500, idealHeight: 640)
        #endif
    }

    private var locationField: some View {
        TextField(text[kind == .url ? "persona.url" : "persona.repository"], text: $location)
            .autocorrectionDisabled()
            .accessibilityIdentifier("personaImportLocation")
            #if os(iOS)
            .keyboardType(.URL)
            .textContentType(.URL)
            .textInputAutocapitalization(.never)
            #endif
    }

    private var gitFields: some View {
        Group {
            TextField(text["persona.path"], text: $path)
                .autocorrectionDisabled()
                .accessibilityIdentifier("personaImportPath")
                #if os(iOS)
                .textInputAutocapitalization(.never)
                #endif
            TextField(text["persona.gitRef"], text: $gitRef)
                .autocorrectionDisabled()
                #if os(iOS)
                .textInputAutocapitalization(.never)
                #endif
        }
    }

    private func upload(_ input: PersonaImport) async {
        if await model.perform(PersonaRequest(.import, input: input)), let preview = model.preview {
            dismiss()
            onImported(preview.metadata.id)
        }
    }

    private func trim(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
