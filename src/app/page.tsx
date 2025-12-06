import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-gray-800">AI Course Maker</CardTitle>
          <CardDescription>
            Automated Course Management & Grading System
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">Select your role to continue:</p>
          
          <div className="grid gap-4">
            <Link href="/login" className="w-full">
              <Button className="w-full" size="lg">Teacher Login</Button>
            </Link>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <Link href="/register" className="w-full">
              <Button variant="outline" className="w-full" size="lg">Student Registration</Button>
            </Link>

             <Link href="/submit" className="w-full">
              <Button variant="ghost" className="w-full text-blue-600 underline">Old Submission Link (For Testing)</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
