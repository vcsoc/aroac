import { Switch } from "./MapPanels";
export default function MapToolbar({
  grey,
  setGrey,
  radar,
  setRadar,
  followGrey,
  muf,
  setMuf,
  iconOnly = false,
}) {
  return (
    <div className="map-toolbar-toggles">
      {[
        {
          name: "Grey line",
          value: grey,
          set: setGrey,
          tip:
            "Show or hide calculated day/night shading (grey line). " +
            (followGrey
              ? "Follows the clock-comparison slider; change this in Quick Switch."
              : "Uses live time, independent of the clock-comparison slider."),
        },
        {
          name: "Radar",
          value: radar,
          set: setRadar,
          tip: "Show or hide the latest available RainViewer precipitation radar. The map legend explains reflectivity colors and shows the frame time. Coverage varies; internet or cached tiles required.",
        },
        {
          name: "MUF",
          value: muf,
          set: setMuf,
          tip: "MUF(3000 km) ionosonde observations in MHz from KC2G/GIRO. Click map dots for times and confidence. Station measurements plus provider-modeled contour lines; independent of the clock slider.",
        },
      ].map(({ name, value, set, tip }) => (
        <Switch
          fullRow
          iconOnly={iconOnly}
          key={name}
          label={name}
          value={value}
          onChange={set}
          description={tip}
        />
      ))}
    </div>
  );
}
