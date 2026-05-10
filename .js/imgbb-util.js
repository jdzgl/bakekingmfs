const IMGBB_API_KEY = '4379a74621a998390175591ed4d3d9fc';

export async function uploadImageToCloud(file) {
    if (!file) return null;

    const formData = new FormData();
    formData.append('image', file);

    try {
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error.message || "Upload failed");
        }

        const result = await response.json();
        return result.data.url;
    } catch (error) {
        console.error("Cloud Upload Error:", error);
        throw error;
    }
}