import { useRef, useState } from "react";
import CatAvatar3D from "./CatAvatar3D";

function AvatarPanel({ profile, mood, onProfileChange }) {
  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = useRef(null);

  function handleNameChange(event) {
    onProfileChange({ ...profile, name: event.target.value.slice(0, 20) });
  }

  function handleImage(event) {
    const file = event.target.files?.[0];

    if (!file || !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      window.alert("请选择不超过 5MB 的 JPG、PNG 或 WebP 图片。");
      event.target.value = "";
      return;
    }

    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 320;
      const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
      const sourceX = (image.naturalWidth - sourceSize) / 2;
      const sourceY = (image.naturalHeight - sourceSize) / 2;
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);

      const pixels = context.getImageData(0, 0, size, size).data;
      let red = 0;
      let green = 0;
      let blue = 0;
      let count = 0;

      for (let index = 0; index < pixels.length; index += 64) {
        if (pixels[index + 3] < 128) continue;
        const brightness = pixels[index] + pixels[index + 1] + pixels[index + 2];
        if (brightness < 60 || brightness > 735) continue;
        red += pixels[index];
        green += pixels[index + 1];
        blue += pixels[index + 2];
        count += 1;
      }

      const coatColor = count
        ? `#${[red, green, blue]
            .map((value) => Math.round(value / count).toString(16).padStart(2, "0"))
            .join("")}`
        : profile.coatColor;

      onProfileChange({
        ...profile,
        image: canvas.toDataURL("image/jpeg", 0.82),
        coatColor,
      });
      URL.revokeObjectURL(objectUrl);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      window.alert("图片读取失败，请换一张图片重试。");
    };
    image.src = objectUrl;
    event.target.value = "";
  }

  return (
    <aside className="avatar-panel">
      <div className="avatar-panel-top">
        <span className={`mood-badge ${mood}`}>
          {mood === "thinking" ? "思考中" : mood === "speaking" ? "回应中" : "陪伴中"}
        </span>
        <button className="settings-button" onClick={() => setIsEditing((value) => !value)}>
          {isEditing ? "完成" : "定制"}
        </button>
      </div>

      <div className="avatar-stage">
        <CatAvatar3D color={profile.coatColor} mood={mood} />
      </div>

      <div className="avatar-profile">
        {profile.image ? (
          <img className="profile-photo" src={profile.image} alt="用户定制的小猫参考图" />
        ) : (
          <div className="profile-photo placeholder">🐾</div>
        )}
        <div>
          <strong>{profile.name || "未命名小猫"}</strong>
          <p>AI 心理支持小猫</p>
        </div>
      </div>

      {isEditing && (
        <div className="avatar-settings">
          <label>
            小猫名称
            <input value={profile.name} onChange={handleNameChange} placeholder="给小猫起个名字" />
          </label>
          <label>
            毛色
            <input
              type="color"
              value={profile.coatColor}
              onChange={(event) => onProfileChange({ ...profile, coatColor: event.target.value })}
            />
          </label>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleImage} />
          <button className="upload-button" onClick={() => fileInputRef.current?.click()}>
            上传参考图片
          </button>
          <small>图片会保存到当前账户，并自动提取主色。</small>
        </div>
      )}

      <p className="drag-hint">拖动 3D 像素小猫可以旋转查看</p>
    </aside>
  );
}

export default AvatarPanel;
