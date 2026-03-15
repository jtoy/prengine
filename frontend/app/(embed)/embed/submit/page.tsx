import { Suspense } from "react"
import { EmbedSubmissionForm } from "@/components/embed-submission-form"

export default async function EmbedSubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>
}) {
  const params = await searchParams
  const project = params.project || ""

  return (
    <main className="p-4">
      <Suspense
        fallback={
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        <EmbedSubmissionForm project={project} />
      </Suspense>
    </main>
  )
}
